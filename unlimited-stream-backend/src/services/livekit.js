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

// Creates (or returns the existing) RTMP ingress for a channel. The teacher
// adds the returned url+streamKey as an ADDITIONAL output in OBS (alongside
// the existing rtmp://SERVER:1935/live output) — this is a real limitation:
// LiveKit's Ingress is a separate RTMP endpoint, not something that can sit
// behind our own node-media-server transparently. See LIVEKIT.md.
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

// Keeps User.isLive in sync when the stream arrives via LiveKit Ingress
// instead of (or in addition to) the existing RTMP→node-media-server path.
async function handleWebhook(event) {
  const type = event.event;
  const identity = event.ingressInfo?.participantIdentity || event.participant?.identity || '';
  const channel = identity.startsWith('ingress:') ? identity.slice('ingress:'.length).toLowerCase() : null;
  if (!channel) return;
  if (type === 'ingress_started' || type === 'participant_joined') {
    await User.findOneAndUpdate({ username: channel, role: 'teacher' }, { isLive: true });
  } else if (type === 'ingress_ended' || type === 'participant_left') {
    await User.findOneAndUpdate({ username: channel, role: 'teacher' }, { isLive: false });
  }
}

module.exports = { createStudentToken, createStaffToken, ensureIngress, deleteIngress, handleWebhook, roomName };
