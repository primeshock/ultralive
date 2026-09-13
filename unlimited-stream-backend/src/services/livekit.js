const { AccessToken, LiveKitAPI, IngressInput } = require('livekit-server-sdk');
const User = require('../models/User');
const { livekitEnabled, livekitUrl, livekitApiKey, livekitApiSecret } = require('../config/env');

function assertEnabled() {
  if (!livekitEnabled || !livekitUrl || !livekitApiKey || !livekitApiSecret) {
    const err = new Error('LiveKit is not configured');
    err.status = 503;
    throw err;
  }
}

function api() {
  assertEnabled();
  return new LiveKitAPI({ host: livekitUrl, apiKey: livekitApiKey, secret: livekitApiSecret });
}

function roomName(channel) {
  return `class_${String(channel).toLowerCase()}`;
}

async function createStudentToken({ channel, identity, name }) {
  assertEnabled();
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: `student:${identity}`,
    name: name || identity,
    ttl: '2h',
  });
  token.addGrant({ roomJoin: true, room: roomName(channel), canSubscribe: true, canPublish: false });
  return token.toJwt();
}

async function createStaffToken({ channel, identity, name, publish = false }) {
  assertEnabled();
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: `staff:${identity}`,
    name: name || identity,
    ttl: '2h',
  });
  token.addGrant({ roomJoin: true, room: roomName(channel), canSubscribe: true, canPublish: Boolean(publish) });
  return token.toJwt();
}

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

  const info = await api().ingress.createIngress(IngressInput.RTMP_INPUT, {
    name: `Koosha Live - ${channelDoc.username}`,
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
  await api().ingress.deleteIngress(channelDoc.livekitIngressId);
  channelDoc.livekitIngressId = '';
  channelDoc.livekitIngressUrl = '';
  channelDoc.livekitStreamKey = '';
  await channelDoc.save();
}

async function handleWebhook(event) {
  const type = event.event;
  const identity = event.ingressInfo?.participantIdentity || event.participant?.identity || '';
  const channel = identity.startsWith('ingress:') ? identity.slice('ingress:'.length).toLowerCase() : null;
  if (!channel) return;
  if (type === 'ingress_started' || type === 'participant_joined') {
    await User.findOneAndUpdate({ username: channel, role: 'channel' }, { isLive: true });
  } else if (type === 'ingress_ended' || type === 'participant_left') {
    await User.findOneAndUpdate({ username: channel, role: 'channel' }, { isLive: false });
  }
}

module.exports = { createStudentToken, createStaffToken, ensureIngress, deleteIngress, handleWebhook, roomName };
