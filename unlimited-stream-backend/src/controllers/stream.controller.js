const User = require('../models/User');
const { publicUser } = require('../utils/serialize');
const { getViewerCount } = require('../services/chat');
const { serverIp, publicPort: apiPort } = require('../config/env');

const mediaCtx = { serverIp, apiPort };

async function listLive(req, res) {
  const users = await User.find({ role: 'channel', isLive: true }).sort({ updatedAt: -1 });
  res.json({
    streams: users.map((u) => ({ ...publicUser(u, mediaCtx), viewerCount: getViewerCount(u.username) })),
  });
}

async function getChannel(req, res) {
  const user = await User.findOne({ username: req.params.username.toLowerCase(), role: 'channel' });
  if (!user) return res.status(404).json({ error: 'Channel not found' });
  res.json({ channel: { ...publicUser(user, mediaCtx), viewerCount: getViewerCount(user.username) } });
}

module.exports = { listLive, getChannel };
