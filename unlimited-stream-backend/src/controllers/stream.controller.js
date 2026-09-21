const User = require('../models/User');
const { publicUser } = require('../utils/serialize');
const { getViewerCount } = require('../services/chat');
const { serverIp, publicPort: apiPort } = require('../config/env');
const { syncChannelLiveState } = require('../services/livekit');
const { findStreamTarget, streamName } = require('../utils/streamTarget');

const mediaCtx = { serverIp, apiPort };

async function listLive(req, res) {
  const [users, classes] = await Promise.all([
    User.find({ isLive: true }).sort({ updatedAt: -1 }),
    require('../models/Class').find({ isLive: true }).sort({ updatedAt: -1 }),
  ]);
  const classNames = new Set(classes.map((item) => streamName(item)));
  const targets = [...classes, ...users.filter((item) => !classNames.has(streamName(item)))];
  res.json({
    streams: targets.map((target) => ({ ...publicUser(target, mediaCtx), ...(target.showViewerCount ? { viewerCount: getViewerCount(streamName(target)) } : {}) })),
  });
}

async function getChannel(req, res) {
  const username = req.params.username.toLowerCase();
  const target = await findStreamTarget(username);
  if (!target) return res.status(404).json({ error: 'Channel not found' });
  const live = await syncChannelLiveState(username);
  if (live !== null) target.isLive = live;
  res.json({ channel: { ...publicUser(target, mediaCtx), ...(target.showViewerCount ? { viewerCount: getViewerCount(username) } : {}) } });
}

module.exports = { listLive, getChannel };
