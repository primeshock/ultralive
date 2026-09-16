const { AccessToken, IngressClient, IngressInput, RoomServiceClient, TrackSource, AudioCodec, VideoCodec } = require('livekit-server-sdk');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const { livekitEnabled, livekitUrl, livekitApiKey, livekitApiSecret } = require('../config/env');
const { recommendedLivekitSettings } = require('../utils/livekitSettings');

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

function ingressVideoOptions(settings, username, displayName) {
  const livekit = settings?.livekit || recommendedLivekitSettings();
  const video = livekit.video || recommendedLivekitSettings().video;

  return {
    name: `${displayName || username}-video`,
    source: TrackSource.CAMERA,
    encodingOptions: {
      case: 'options',
      value: {
        videoCodec: video.codec === 'vp8' ? VideoCodec.VP8 : VideoCodec.H264_MAIN,
        frameRate: video.fps,
        layers: [
          {
            quality: 2,
            width: video.width,
            height: video.height,
            bitrate: Math.max(150000, Math.round(video.maxBitrateKbps * 1000)),
            ssrc: 0,
            spatialLayer: 0,
            rid: 'f',
            repairSsrc: 0,
          },
        ],
      },
    },
  };
}

function ingressAudioOptions(username, displayName) {
  return {
    name: `${displayName || username}-audio`,
    source: TrackSource.MICROPHONE,
    encodingOptions: {
      case: 'options',
      value: {
        audioCodec: AudioCodec.OPUS,
        bitrate: 64000,
        disableDtx: false,
        channels: 1,
      },
    },
  };
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
  const settings = await SiteSettings.get();
  if (channelDoc.livekitIngressId && channelDoc.livekitIngressUrl && channelDoc.livekitStreamKey) {
    await ingressClient().updateIngress(channelDoc.livekitIngressId, {
      roomName: roomName(channelDoc.username),
      participantIdentity: `ingress:${channelDoc.username}`,
      participantName: channelDoc.displayName || channelDoc.username,
      enableTranscoding: true,
      audio: ingressAudioOptions(channelDoc.username, channelDoc.displayName),
      video: ingressVideoOptions(settings, channelDoc.username, channelDoc.displayName),
    });
    return {
      ingressId: channelDoc.livekitIngressId,
      url: channelDoc.livekitIngressUrl,
      streamKey: channelDoc.livekitStreamKey,
      roomName: roomName(channelDoc.username),
    };
  }

  const info = await ingressClient().createIngress(IngressInput.RTMP_INPUT, {
    name: `ultra-live-${channelDoc.username}`,
    roomName: roomName(channelDoc.username),
    participantIdentity: `ingress:${channelDoc.username}`,
    participantName: channelDoc.displayName || channelDoc.username,
    enableTranscoding: true,
    audio: ingressAudioOptions(channelDoc.username, channelDoc.displayName),
    video: ingressVideoOptions(settings, channelDoc.username, channelDoc.displayName),
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
  return String(identity || '').toLowerCase().startsWith('ingress:');
}

function classifyLiveEvent(type, identity) {
  const eventType = String(type || '').toLowerCase();
  const ingress = isIngressParticipant(identity);
  if (eventType === 'ingress_started' || eventType === 'track_published') return true;
  if (eventType === 'participant_joined' && ingress) return true;
  if (eventType === 'ingress_ended' || eventType === 'room_finished') return false;
  if (eventType === 'participant_left' && ingress) return false;
  return null;
}

function roomService() {
  assertEnabled();
  return new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);
}

async function publisherIsLive(username) {
  if (!livekitEnabled || !livekitUrl || !livekitApiKey || !livekitApiSecret) return null;
  try {
    const participants = await roomService().listParticipants(roomName(username));
    return participants.some((participant) => isIngressParticipant(participant.identity));
  } catch (err) {
    const message = String(err.message || err);
    if (/not found|does not exist|no room/i.test(message)) return false;
    console.error('[livekit sync]', { channel: username, error: message });
    return null;
  }
}

async function syncChannelLiveState(username) {
  const live = await publisherIsLive(username);
  if (live === null) return null;
  await User.findOneAndUpdate({ username: String(username).toLowerCase(), role: 'teacher' }, { isLive: live });
  return live;
}

function startLiveStateSync() {
  if (!livekitEnabled) return;
  const tick = async () => {
    try {
      const channels = await User.find({ role: 'teacher', livekitIngressId: { $gt: '' } }).select('username isLive');
      for (const channel of channels) {
        const live = await publisherIsLive(channel.username);
        if (live === null || live === channel.isLive) continue;
        await User.updateOne({ _id: channel._id }, { isLive: live });
        console.log('[livekit sync]', { channel: channel.username, isLive: live });
      }
    } catch (err) {
      console.error('[livekit sync]', err.message);
    }
  };
  tick();
  setInterval(tick, 5000);
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
  const room = webhookRoomName(event);
  const goLive = classifyLiveEvent(type, identity);
  console.log('[livekit webhook]', {
    event: type,
    room,
    identity,
    ingressId: event.ingressInfo?.ingressId || null,
    action: goLive === true ? 'live' : goLive === false ? 'offline' : 'ignored',
  });
  if (goLive === null) return;

  const channel = await resolveWebhookChannel(event);
  if (!channel) {
    console.warn('[livekit webhook] unresolved channel', { event: type, room, identity });
    return;
  }

  await User.findOneAndUpdate({ username: channel, role: 'teacher' }, { isLive: goLive });
}

module.exports = {
  createStudentToken,
  createStaffToken,
  ingressAudioOptions,
  ingressVideoOptions,
  ensureIngress,
  deleteIngress,
  handleWebhook,
  roomName,
  classifyLiveEvent,
  isIngressParticipant,
  syncChannelLiveState,
  startLiveStateSync,
};
