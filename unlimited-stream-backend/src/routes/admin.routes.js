const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const Moderation = require('../models/Moderation');
const MonitorLink = require('../models/MonitorLink');
const RoomSession = require('../models/RoomSession');
const AttendanceLog = require('../models/AttendanceLog');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const { publicBaseUrl, wpJoinSecret } = require('../config/env');
const chat = require('../services/chat');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'owner'));

async function myChannels(_req) {
  // Both admin and owner see every channel — admin is a full operational
  // role now, not scoped to a managedBy subset.
  return User.find({ role: 'teacher' }).select('username displayName streamTitle isLive chatEnabled chatMode managedBy');
}

router.get('/channels', async (req, res) => res.json(await myChannels(req)));

async function loadOwnedChannel(req, res, next) {
  const channel = await User.findOne({ username: req.params.channel.toLowerCase(), role: 'teacher' });
  if (!channel) return res.status(404).json({ error: 'کانال پیدا نشد.' });
  // No ownership check here by design: admin has full access to all classes/streams.
  req.targetChannel = channel;
  next();
}

// ---- Chat privacy mode ----
router.post('/channels/:channel/chat-mode', loadOwnedChannel, async (req, res) => {
  const { chatMode } = req.body || {};
  if (!['public', 'private'].includes(chatMode)) return res.status(400).json({ error: 'مقدار نامعتبر.' });
  req.targetChannel.chatMode = chatMode;
  await req.targetChannel.save();
  chat.setChatMode(req.targetChannel.username, chatMode); // apply immediately, not just on next chat load
  res.json({ chatMode });
});

// ---- Test link: try the student flow WITHOUT WordPress ----
// Generates the exact same kind of token a WordPress button would produce,
// signed with the same secret, so you can open it (e.g. in an incognito
// window) and see exactly what a real student would see — including the
// one-session/one-device rule kicking in if you open it again elsewhere.
router.post('/channels/:channel/test-link', loadOwnedChannel, async (req, res) => {
  const testUserId = `test-${crypto.randomBytes(4).toString('hex')}`;
  const displayName = (req.body && req.body.displayName) || 'کاربر تستی';
  const payload = { channel: req.targetChannel.username, userId: testUserId, displayName, exp: Math.floor(Date.now() / 1000) + 300 };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', wpJoinSecret).update(payloadB64).digest('hex');
  res.json({ url: `${publicBaseUrl}/api/session/join?token=${payloadB64}.${sig}`, testUserId });
});

// ---- Active students right now, and recent attendance history ----
router.get('/channels/:channel/active-students', loadOwnedChannel, async (req, res) => {
  const sessions = await RoomSession.find({ channel: req.targetChannel.username }).sort({ lastSeenAt: -1 });
  res.json(sessions);
});

router.get('/channels/:channel/attendance', loadOwnedChannel, async (req, res) => {
  const log = await AttendanceLog.find({ channel: req.targetChannel.username }).sort({ joinedAt: -1 }).limit(500);
  res.json(log);
});

// ---- Monitor link: check the stream without logging into the panel ----
router.post('/channels/:channel/monitor-link', loadOwnedChannel, async (req, res) => {
  const token = MonitorLink.generateToken();
  const link = await MonitorLink.findOneAndUpdate(
    { channel: req.targetChannel.username },
    { token, active: true, createdBy: String(req.user._id) },
    { upsert: true, new: true }
  );
  res.json({ url: `${publicBaseUrl}/api/monitor/${link.token}` });
});

router.delete('/channels/:channel/monitor-link', loadOwnedChannel, async (req, res) => {
  await MonitorLink.findOneAndUpdate({ channel: req.targetChannel.username }, { active: false });
  res.status(204).end();
});

// ---- Moderation: timed or permanent mute/ban ----
router.post('/channels/:channel/moderation', loadOwnedChannel, async (req, res) => {
  const { externalUserId, type, scope, minutes, reason } = req.body || {};
  if (!externalUserId || !['mute', 'ban'].includes(type) || !['timed', 'permanent'].includes(scope)) {
    return res.status(400).json({ error: 'ورودی نامعتبر.' });
  }
  if (scope === 'timed' && !minutes) return res.status(400).json({ error: 'مدت‌زمان لازم است.' });

  const doc = await Moderation.create({
    channel: req.targetChannel.username,
    externalUserId: String(externalUserId),
    type,
    scope,
    expiresAt: scope === 'timed' ? new Date(Date.now() + minutes * 60_000) : null,
    reason: reason || '',
    createdBy: String(req.user._id),
  });
  res.status(201).json(doc);
});

router.get('/channels/:channel/moderation', loadOwnedChannel, async (req, res) => {
  const list = await Moderation.find({ channel: req.targetChannel.username }).sort({ createdAt: -1 });
  res.json(list);
});

router.delete('/moderation/:id', async (req, res) => {
  await Moderation.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

router.use(require('./poll.routes')); // adds /channels/:channel/polls, /polls/:id/... (same auth as above)

module.exports = router;
