# Unlimited Stream — Backend

Express API + RTMP/HLS media server (`node-media-server`) + Socket.io chat, backed by MongoDB.

## Requirements

- Node.js 18+
- MongoDB running locally (or set `MONGO_URI`)
- `ffmpeg` installed and on `FFMPEG_PATH` (used to remux RTMP into HLS)

## Setup

```bash
npm install
cp .env.example .env   # edit as needed (SERVER_IP, FFMPEG_PATH, ...)
npm run dev
```

This starts:
- REST API on `PORT` (default `5050`)
- RTMP ingest on `RTMP_PORT` (default `1935`)
- HLS/HTTP media server on `HTTP_MEDIA_PORT` (default `8000`)
- Socket.io chat on the same port as the REST API

## Streaming

After registering/logging in, `GET /api/auth/me` (and the frontend dashboard) returns:
- `rtmpServer`: `rtmp://SERVER_IP:1935/live`
- `streamKeyField`: `{username}?key={secret}` — paste this into OBS's "Stream Key" field

The secret key is only used once, at publish time, to authenticate the RTMP connection
(`prePublish` hook checks it against MongoDB). It never appears in any playback URL —
viewers pull HLS from `http://SERVER_IP:8000/live/{username}/index.m3u8`, which only
ever contains the public username. There is no direct connection between a broadcaster
and a viewer; everything passes through this server.

## Known upstream quirk

`node-media-server@2.7.4` throws on startup when a `trans` (HLS) config is present,
due to an unfinished/broken version-logging line in its source. `scripts/fix-node-media-server.js`
patches the installed package after every `npm install` (wired via `postinstall`).

## Latency

HLS segments are 1s with a 3-segment live window (`hlsFlags` in `mediaServer.js`), and
`hls.js` on the frontend is tuned to stay close to the live edge (`liveSyncDuration: 2`,
`maxLiveSyncPlaybackRate: 1.2`). This gets glass-to-glass latency to roughly 3-4s.

This only works if the encoder actually keyframes every ~1s — HLS can only cut a new
segment on a keyframe boundary. OBS defaults to a 2s keyframe interval, so for the
lowest latency, set OBS's keyframe interval to 1s (Settings → Output → Advanced mode).
Going below ~2-3s glass-to-glass would require switching the whole delivery path to
WebRTC or LL-HLS, which is a much larger change than tuning these settings.

## Thumbnails

`POST /api/user/thumbnail` (multipart, field `thumbnail`, jpg only, max 5MB) saves the
image to `media/thumbnails/{username}.jpg`. Only jpg is accepted, on purpose: an
upload endpoint that trusted the client-supplied Content-Type (or accepted SVG) would
let someone store an SVG/HTML file with an embedded `<script>` and have it served back
as "an image" — classic stored-XSS-via-upload. Two checks enforce this:

- `utils/upload.js`'s `isJpeg()` checks the actual uploaded bytes for the JPEG SOI
  marker (`FF D8 FF`), not the claimed mimetype/filename (which are just attacker
  input and prove nothing on their own).
- Thumbnails are served by our own Express route (`routes/media.routes.js`) instead of
  node-media-server's bare static folder, so they get helmet's
  `X-Content-Type-Options: nosniff` and an explicitly forced `Content-Type: image/jpeg`
  — a browser has no sniffing-based excuse to render the response as anything else.

The `thumbnailVersion` counter busts client-side caching after a re-upload.

## Scaling to ~1,000 concurrent viewers

Reviewed for this scale; a few things worth knowing:

- **Fixed**: node-media-server ships an *unauthenticated* admin UI and relay/streams
  control API (`/api/relay/pull|push`, etc.) on the HLS port by default — it could
  trigger arbitrary RTMP pull/push and leak stream info. Disabled via `http.api: false`
  in `mediaServer.js` since we don't use it (our own Express API covers everything).
- HLS segment/playlist delivery goes through `express.static`, which streams files
  asynchronously — it does not block Node's event loop under concurrent load.
- RTMP→HLS remuxing runs in a separate `ffmpeg` OS process per live stream (not in
  Node's event loop), so it doesn't compete with request handling.
- `isLive` is indexed — `GET /api/streams/live` (polled by every viewer on the home
  page) stays a fast indexed query instead of a collection scan as the user base grows.
- The live chat-enabled toggle is checked from an in-memory map (`chat.js`), not a
  MongoDB read per chat message, so chat volume doesn't add DB load.
- **Operational**: raise the OS file-descriptor limit before running at this scale —
  1,000 viewers each holding an HLS polling connection plus a Socket.io connection can
  approach the default `ulimit -n 1024`. E.g. `ulimit -n 65536` before starting, or
  `LimitNOFILE=65536` in a systemd unit.

Everything above runs as a single Node process; this is fine up to roughly this scale
on a reasonably provisioned single server. Going meaningfully beyond it (multiple
ingest points, a CDN in front of HLS, horizontal scaling) is a bigger architectural
change and out of scope here.
