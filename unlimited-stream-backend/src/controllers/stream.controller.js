const User = require('../models/User');
const { publicUser } = require('../utils/serialize');
const { getViewerCount } = require('../services/chat');
const { serverIp, publicPort: apiPort } = require('../config/env');
const { syncChannelLiveState } = require('../services/livekit');
const { findStreamTarget, streamName } = require('../utils/streamTarget');
const Organization = require('../models/Organization');

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
  const channel = { ...publicUser(target, mediaCtx), ...(target.showViewerCount ? { viewerCount: getViewerCount(username) } : {}) };
  if (target.constructor?.modelName === 'Class') {
    const organization = await Organization.findById(target.organizationId).select('name logoVersion classAppearance');
    channel.accessModes = target.accessModes?.length ? target.accessModes : [target.visibility === 'public' ? 'public' : 'login'];
    channel.guestAccess = Boolean(target.guestAccess);
    channel.appearance = target.settings?.appearance || organization?.classAppearance || {};
    channel.organization = organization ? { id: organization._id, name: organization.name, logoUrl: organization.logoVersion ? `/api/organization-logos/${organization._id}.png?v=${organization.logoVersion}` : null } : null;
  }
  res.json({ channel });
}

module.exports = { listLive, getChannel };
