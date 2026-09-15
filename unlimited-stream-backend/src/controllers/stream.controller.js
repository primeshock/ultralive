const User = require('../models/User');
const { publicUser } = require('../utils/serialize');
const { getViewerCount } = require('../services/chat');
const { serverIp, publicPort: apiPort } = require('../config/env');
const { syncChannelLiveState } = require('../services/livekit');

const mediaCtx = { serverIp, apiPort };

async function listLive(req, res) {
  const users = await User.find({ isLive: true }).sort({ updatedAt: -1 });
  res.json({
    streams: users.map((u) => ({ ...publicUser(u, mediaCtx), ...(u.showViewerCount ? { viewerCount: getViewerCount(u.username) } : {}) })),
  });
}

async function getChannel(req, res) {
  const username = req.params.username.toLowerCase();
  let user = await User.findOne({ username, role: 'teacher' });
  if (!user) return res.status(404).json({ error: 'Channel not found' });
  const live = await syncChannelLiveState(username);
  if (live !== null) user.isLive = live;
  res.json({ channel: { ...publicUser(user, mediaCtx), ...(user.showViewerCount ? { viewerCount: getViewerCount(user.username) } : {}) } });
}

module.exports = { listLive, getChannel };
