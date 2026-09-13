require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '5000', 10),
  // Used only to build public-facing URLs (thumbnails, etc). Differs from `port`
  // when the app sits behind a reverse proxy (e.g. Nginx on :80 in production) —
  // see install.sh. Falls back to `port` for local dev, where there's no proxy.
  publicPort: parseInt(process.env.PUBLIC_PORT || process.env.PORT || '5000', 10),
  rtmpPort: parseInt(process.env.RTMP_PORT || '1935', 10),
  httpMediaPort: parseInt(process.env.HTTP_MEDIA_PORT || '8000', 10),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/unlimited-stream',
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret',
  serverIp: process.env.SERVER_IP || '127.0.0.1',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  ffmpegPath: process.env.FFMPEG_PATH || '/usr/local/bin/ffmpeg',

  // --- Institutional access (Phase A) ---
  // Shared with the WordPress plugin/snippet that signs join links. Must match exactly.
  wpJoinSecret: process.env.WP_JOIN_SECRET || '',
  // Internal only — signs the session cookie issued after a join link is verified.
  roomSessionSecret: process.env.ROOM_SESSION_SECRET || '',
  // Used to build the full monitor-link URL returned to admins, e.g. http://217.11.164.171
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  // For institutional use, channels should only be created by an admin via
  // /api/master/channels — set this to "false" in .env to close public
  // self-signup entirely. Defaults to "true" so nothing changes unless you opt in.
  allowPublicRegister: process.env.ALLOW_PUBLIC_REGISTER !== 'false',

  // --- LiveKit (Phase 6, runs ALONGSIDE HLS/RTMP — never replaces it) ---
  livekitEnabled: process.env.LIVEKIT_ENABLED === 'true',
  livekitUrl: process.env.LIVEKIT_URL || '', // https://host:7880 — used server-side for Ingress/webhook API calls
  livekitWsUrl: process.env.LIVEKIT_WS_URL || '', // ws(s)://host:7880 — sent to the browser to connect
  livekitApiKey: process.env.LIVEKIT_API_KEY || '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
};
