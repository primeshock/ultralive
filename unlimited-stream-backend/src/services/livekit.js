const { AccessToken, IngressClient, IngressInput } = require('livekit-server-sdk');
const User = require('../models/User');
const { livekitEnabled, livekitUrl, livekitApiKey, livekitApiSecret } = require('../config/env');

function assertEnabled() {
  if (!livekitEnabled || !livekitUrl || !livekitApiKey || !livekitApiSecret) {
    const err = new Error('LiveKit is not configured');
    err.status = 503;
    throw err;
  }
}

function ingressClient() {
  assertEnabled();
  // NOTE: there is no "LiveKitAPI" export in livekit-server-sdk — IngressClient
  // (and RoomServiceClient, EgressClient, etc.) are separate top-level classes.
  return new IngressClient(livekitUrl, livekitApiKey, livekitApiSecret);
}

function roomName(channel) {
  return `class_${String(channel).toLowerCase()}`;
}

async function createStudentToken({ channel, identity, name }) {
  assertEnabled();
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: `student:${identity}`,
    name: name || identity,
    ttl: '6h', // match the room-session TTL used for HLS/chat access
  });
  token.addGrant({ roomJoin: true, room: roomName(channel), canSubscribe: true, canPublish: false });
  return token.toJwt(); // returns a Promise in SDK v2 — callers already await this function
}

async function createStaffToken({ channel, identity, name, publish = false }) {
  assertEnabled();
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: `staff:${identity}`,
    name: name || identity,
    ttl: '6h',
  });
  token.addGrant({ roomJoin: true, room: roomName(channel), canSubscribe: true, canPublish: Boolean(publish) });
  return token.toJwt();
}

// Creates (or returns the existing) RTMP ingress for a class. OBS uses this
// single LiveKit destination; the legacy RTMP/HLS pipeline remains only as
// compatibility code and is not required for the current viewer path.
async function ensureIngress(channelDoc) {
  assertEnabled();
  if (channelDoc.livekitIngressId && channelDoc.livekitIngressUrl && channelDoc.livekitStreamKey) {
    return {
      ingressId: channelDoc.livekitIngressId,
      url: channelDoc.livekitIngressUrl,
      streamKey: channelDoc.livekitStreamKey,
      roomName: roomName(channelDoc.username),
    };
  }

  const info = await ingressClient().createIngress(IngressInput.RTMP_INPUT, {
    name: `koosha-live-${channelDoc.username}`,
    roomName: roomName(channelDoc.username),
    participantIdentity: `ingress:${channelDoc.username}`,
    participantName: channelDoc.displayName || channelDoc.username,
    enableTranscoding: true,
  });

  channelDoc.livekitIngressId = info.ingressId;
  channelDoc.livekitIngressUrl = info.url;
  channelDoc.livekitStreamKey = info.streamKey;
  await channelDoc.save();

  return { ingressId: info.ingressId, url: info.url, streamKey: info.streamKey, roomName: roomName(channelDoc.username) };
}

async function deleteIngress(channelDoc) {
  assertEnabled();
  if (!channelDoc.livekitIngressId) return;
  await ingressClient().deleteIngress(channelDoc.livekitIngressId);
  channelDoc.livekitIngressId = '';
  channelDoc.livekitIngressUrl = '';
  channelDoc.livekitStreamKey = '';
  await channelDoc.save();
}

function webhookIdentity(event) {
  return String(event.ingressInfo?.participantIdentity || event.participant?.identity || '');
}

function webhookRoomName(event) {
  return String(event.ingressInfo?.roomName || event.room?.name || '');
}

function isIngressParticipant(identity) {
  return identity.toLowerCase().startsWith('ingress:');
}

async function resolveWebhookChannel(event) {
  const ingressId = event.ingressInfo?.ingressId;
  if (ingressId) {
    const byIngress = await User.findOne({ livekitIngressId: ingressId, role: 'teacher' }).select('username');
    if (byIngress) return byIngress.username;
  }

  const identity = webhookIdentity(event);
  const room = webhookRoomName(event);
  const candidates = [];
  if (isIngressParticipant(identity)) candidates.push(identity.slice('ingress:'.length).toLowerCase());
  if (room.toLowerCase().startsWith('class_')) candidates.push(room.slice('class_'.length).toLowerCase());

  for (const username of candidates) {
    if (!username) continue;
    const doc = await User.findOne({ username, role: 'teacher' }).select('username');
    if (doc) return doc.username;
  }
  return null;
}

// Keeps User.isLive in sync when the stream arrives via LiveKit Ingress
// instead of (or in addition to) the existing RTMP→node-media-server path.
async function handleWebhook(event) {
  const type = String(event.event || '');
  const identity = webhookIdentity(event);
  const ingressParticipant = isIngressParticipant(identity);

  // Student/staff join/leave must never flip isLive. Viewers cannot publish, so
  // track_published is always the Ingress publisher for this product.
  const goLive =
    type === 'ingress_started' ||
    type === 'track_published' ||
    (type === 'participant_joined' && ingressParticipant);
  const goOffline = type === 'ingress_ended' || (type === 'participant_left' && ingressParticipant);
  if (!goLive && !goOffline) return;

  const channel = await resolveWebhookChannel(event);
  if (!channel) return;

  await User.findOneAndUpdate({ username: channel, role: 'teacher' }, { isLive: goLive });
}

module.exports = { createStudentToken, createStaffToken, ensureIngress, deleteIngress, handleWebhook, roomName };
