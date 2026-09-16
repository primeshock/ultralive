import { DefaultReconnectPolicy, VideoPresets } from "livekit-client";

export function recommendedLivekitSettings() {
  return {
    video: {
      width: 1280,
      height: 720,
      fps: 30,
      maxBitrateKbps: 2500,
      codec: "h264",
      simulcast: true,
      simulcastLayers: 3,
    },
    connection: {
      adaptiveStream: true,
      dynacast: true,
      maxRetries: 4,
      peerConnectionTimeoutMs: 15000,
      retryDelayMs: 500,
      maxRetryDelayMs: 5000,
      iceTransportPolicy: "all",
    },
  };
}

export function normalizeLivekitSettings(settings) {
  const recommended = recommendedLivekitSettings();
  const next = {
    video: { ...recommended.video, ...(settings?.video || {}) },
    connection: { ...recommended.connection, ...(settings?.connection || {}) },
  };

  next.video.width = clampInt(next.video.width, 320, 3840, recommended.video.width);
  next.video.height = clampInt(next.video.height, 240, 2160, recommended.video.height);
  next.video.fps = clampInt(next.video.fps, 1, 60, recommended.video.fps);
  next.video.maxBitrateKbps = clampInt(next.video.maxBitrateKbps, 150, 20000, recommended.video.maxBitrateKbps);
  next.video.simulcastLayers = clampInt(next.video.simulcastLayers, 1, 3, recommended.video.simulcastLayers);
  next.video.codec = ["vp8", "h264"].includes(next.video.codec) ? next.video.codec : recommended.video.codec;
  next.video.simulcast = Boolean(next.video.simulcast);
  next.connection.adaptiveStream = Boolean(next.connection.adaptiveStream);
  next.connection.dynacast = Boolean(next.connection.dynacast);
  next.connection.maxRetries = clampInt(next.connection.maxRetries, 0, 12, recommended.connection.maxRetries);
  next.connection.peerConnectionTimeoutMs = clampInt(next.connection.peerConnectionTimeoutMs, 3000, 60000, recommended.connection.peerConnectionTimeoutMs);
  next.connection.retryDelayMs = clampInt(next.connection.retryDelayMs, 100, 10000, recommended.connection.retryDelayMs);
  next.connection.maxRetryDelayMs = clampInt(next.connection.maxRetryDelayMs, 500, 30000, recommended.connection.maxRetryDelayMs);
  next.connection.maxRetryDelayMs = Math.max(next.connection.retryDelayMs, next.connection.maxRetryDelayMs);
  next.connection.iceTransportPolicy = ["all", "relay"].includes(next.connection.iceTransportPolicy) ? next.connection.iceTransportPolicy : recommended.connection.iceTransportPolicy;
  return next;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function roomOptionsFromLivekit(settings) {
  const livekit = normalizeLivekitSettings(settings);
  return {
    adaptiveStream: livekit.connection.adaptiveStream,
    dynacast: livekit.connection.dynacast,
    singlePeerConnection: true,
    reconnectPolicy: new DefaultReconnectPolicy({
      maxRetryCount: livekit.connection.maxRetries,
      nextRetryDelayInMs: livekit.connection.retryDelayMs,
      maxRetryDelayInMs: livekit.connection.maxRetryDelayMs,
    }),
  };
}

export function connectOptionsFromLivekit(settings) {
  const livekit = normalizeLivekitSettings(settings);
  return {
    maxRetries: livekit.connection.maxRetries,
    peerConnectionTimeout: livekit.connection.peerConnectionTimeoutMs,
    rtcConfig: {
      iceTransportPolicy: livekit.connection.iceTransportPolicy,
    },
  };
}

export function ingressPreviewFromLivekit(settings) {
  const livekit = normalizeLivekitSettings(settings);
  const video = livekit.video;
  const layers = video.simulcast
    ? video.simulcastLayers === 1
      ? [VideoPresets.h720]
      : video.simulcastLayers === 2
        ? [VideoPresets.h360, VideoPresets.h720]
        : [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720]
    : [VideoPresets.h720];

  return {
    video: {
      width: video.width,
      height: video.height,
      fps: video.fps,
      maxBitrateKbps: video.maxBitrateKbps,
      codec: video.codec,
      simulcast: video.simulcast,
      simulcastLayers: video.simulcastLayers,
      layers,
    },
    connection: livekit.connection,
  };
}
