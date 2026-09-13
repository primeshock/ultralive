const NodeMediaServer = require('node-media-server');
const User = require('../models/User');
const { rtmpPort, httpMediaPort, ffmpegPath } = require('../config/env');
const { stopAutoReminder, syncAutoReminder, broadcastSystemMessage, setChatEnabled } = require('./chat');

// StreamPath looks like "/live/{username}" — the RTMP publish path is the public
// channel name. The secret streamKey travels only as a query arg (?key=...) used
// once at publish time, so it never appears in any HLS/playback URL a viewer sees.
function parseUsername(streamPath) {
  const parts = streamPath.split('/').filter(Boolean); // ["live", "username"]
  return parts[1] ? parts[1].toLowerCase() : null;
}

function createMediaServer() {
  const nms = new NodeMediaServer({
    logType: 2,
    rtmp: {
      port: rtmpPort,
      chunk_size: 60000,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60,
    },
    http: {
      port: httpMediaPort,
      mediaroot: './media',
      allow_origin: '*',
      // node-media-server ships an unauthenticated admin UI + relay/streams control
      // API (can trigger arbitrary RTMP pull/push) on this same port. We don't use
      // it — our own Express API handles everything — so keep it fully disabled.
      api: false,
    },
    trans: {
      ffmpeg: ffmpegPath,
      tasks: [
        {
          app: 'live',
          hls: true,
          // 1s segments / 3-segment window ~= 3-4s glass-to-glass latency (down from
          // ~8-10s at 2s/4). independent_segments lets players start decoding sooner.
          // NOTE: this only helps if the encoder (OBS) actually keyframes every ~1s —
          // HLS can only cut a new segment on a keyframe boundary (see backend README).
          hlsFlags: '[hls_time=1:hls_list_size=3:hls_flags=delete_segments+independent_segments]',
          vc: 'copy',
          ac: 'copy',
        },
      ],
    },
  });

  nms.on('prePublish', async (id, StreamPath, args) => {
    const username = parseUsername(StreamPath);
    const session = nms.getSession(id);

    if (!username || !args || !args.key) {
      session.reject();
      return;
    }

    const user = await User.findOne({ username });
    if (!user || user.streamKey !== args.key) {
      session.reject();
      return;
    }
  });

  nms.on('postPublish', async (id, StreamPath) => {
    const username = parseUsername(StreamPath);
    if (!username) return;

    const user = await User.findOneAndUpdate({ username }, { isLive: true }, { new: true });
    if (!user) return;

    setChatEnabled(username, user.chatEnabled);
    broadcastSystemMessage(username, `${user.displayName || username} is now live!`);
    syncAutoReminder(username, user.autoChatMessage);
  });

  nms.on('donePublish', async (id, StreamPath) => {
    const username = parseUsername(StreamPath);
    if (!username) return;

    await User.findOneAndUpdate({ username }, { isLive: false });
    stopAutoReminder(username);
  });

  return nms;
}

module.exports = { createMediaServer };
