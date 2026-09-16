function recommendedLivekitSettings() {
  return {
    video: {
      width: 1280,
      height: 720,
      fps: 30,
      maxBitrateKbps: 1800,
      codec: 'h264',
      simulcast: true,
      simulcastLayers: 2,
    },
    connection: {
      adaptiveStream: true,
      dynacast: true,
      maxRetries: 4,
      peerConnectionTimeoutMs: 15000,
      retryDelayMs: 500,
      maxRetryDelayMs: 5000,
      iceTransportPolicy: 'all',
    },
  };
}

function normalizeLivekitSettings(input) {
  const recommended = recommendedLivekitSettings();
  const next = {
    video: { ...recommended.video },
    connection: { ...recommended.connection },
  };

  const video = input?.video || {};
  const connection = input?.connection || {};

  const width = Number(video.width);
  const height = Number(video.height);
  const fps = Number(video.fps);
  const maxBitrateKbps = Number(video.maxBitrateKbps);
  const simulcastLayers = Number(video.simulcastLayers);

  if (Number.isFinite(width) && width >= 320 && width <= 3840) next.video.width = Math.round(width);
  if (Number.isFinite(height) && height >= 240 && height <= 2160) next.video.height = Math.round(height);
  if (Number.isFinite(fps) && fps >= 1 && fps <= 60) next.video.fps = Math.round(fps);
  if (Number.isFinite(maxBitrateKbps) && maxBitrateKbps >= 150 && maxBitrateKbps <= 20000) next.video.maxBitrateKbps = Math.round(maxBitrateKbps);
  if (typeof video.codec === 'string' && ['vp8', 'h264', 'vp9', 'av1', 'h265'].includes(video.codec)) next.video.codec = video.codec;
  next.video.simulcast = Boolean(video.simulcast);
  if (Number.isFinite(simulcastLayers) && simulcastLayers >= 1 && simulcastLayers <= 3) next.video.simulcastLayers = Math.round(simulcastLayers);

  next.connection.adaptiveStream = connection.adaptiveStream !== false;
  next.connection.dynacast = connection.dynacast !== false;
  const maxRetries = Number(connection.maxRetries);
  const peerConnectionTimeoutMs = Number(connection.peerConnectionTimeoutMs);
  const retryDelayMs = Number(connection.retryDelayMs);
  const maxRetryDelayMs = Number(connection.maxRetryDelayMs);
  if (Number.isFinite(maxRetries) && maxRetries >= 0 && maxRetries <= 12) next.connection.maxRetries = Math.round(maxRetries);
  if (Number.isFinite(peerConnectionTimeoutMs) && peerConnectionTimeoutMs >= 3000 && peerConnectionTimeoutMs <= 60000) next.connection.peerConnectionTimeoutMs = Math.round(peerConnectionTimeoutMs);
  if (Number.isFinite(retryDelayMs) && retryDelayMs >= 100 && retryDelayMs <= 10000) next.connection.retryDelayMs = Math.round(retryDelayMs);
  if (Number.isFinite(maxRetryDelayMs) && maxRetryDelayMs >= 500 && maxRetryDelayMs <= 30000) next.connection.maxRetryDelayMs = Math.round(maxRetryDelayMs);
  if (next.connection.maxRetryDelayMs < next.connection.retryDelayMs) next.connection.maxRetryDelayMs = next.connection.retryDelayMs;
  if (typeof connection.iceTransportPolicy === 'string' && ['all', 'relay'].includes(connection.iceTransportPolicy)) next.connection.iceTransportPolicy = connection.iceTransportPolicy;

  return next;
}

function withLivekitSettings(doc) {
  const settings = doc || {};
  return {
    ...settings,
    livekit: normalizeLivekitSettings(settings.livekit),
  };
}

module.exports = {
  recommendedLivekitSettings,
  normalizeLivekitSettings,
  withLivekitSettings,
};
