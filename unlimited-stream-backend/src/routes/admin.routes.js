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

async function myChannels() {
  return User.find({ role: 'channel' }).select('username displayName streamTitle isLive chatEnabled chatMode managedBy streamKey createdAt updatedAt');
}

router.get('/channels', async (_req, res) => res.json(await myChannels()));

async function loadChannel(req, res, next) {
  const channel = await User.findOne({ username: req.params.channel.toLowerCase(), role: 'channel' });
  if (!channel) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  // Admins intentionally have global operational access. managedBy is metadata only.
  req.targetChannel = channel;
  next();
}

// ---- Chat privacy mode ----
router.post('/channels/:channel/chat-mode', loadChannel, async (req, res) => {
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
router.post('/channels/:channel/test-link', loadChannel, async (req, res) => {
  const testUserId = `test-${crypto.randomBytes(4).toString('hex')}`;
  const displayName = (req.body && req.body.displayName) || 'کاربر تستی';
  const payload = { channel: req.targetChannel.username, userId: testUserId, displayName, exp: Math.floor(Date.now() / 1000) + 300 };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', wpJoinSecret).update(payloadB64).digest('hex');
  res.json({ url: `${publicBaseUrl}/api/session/join?token=${payloadB64}.${sig}`, testUserId });
});

// ---- Active students right now, and recent attendance history ----
router.get('/channels/:channel/active-students', loadChannel, async (req, res) => {
  const sessions = await RoomSession.find({ channel: req.targetChannel.username }).sort({ lastSeenAt: -1 });
  res.json(sessions);
});

router.get('/channels/:channel/attendance', loadChannel, async (req, res) => {
  const log = await AttendanceLog.find({ channel: req.targetChannel.username }).sort({ joinedAt: -1 }).limit(500);
  res.json(log);
});

// ---- Monitor link: check the stream without logging into the panel ----
router.post('/channels/:channel/monitor-link', loadChannel, async (req, res) => {
  const token = MonitorLink.generateToken();
  const link = await MonitorLink.findOneAndUpdate(
    { channel: req.targetChannel.username },
    { token, active: true, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), createdBy: String(req.user._id) },
    { upsert: true, new: true }
  );
  res.json({ url: `${publicBaseUrl}/api/monitor/${link.token}` });
});

router.delete('/channels/:channel/monitor-link', loadChannel, async (req, res) => {
  await MonitorLink.findOneAndUpdate({ channel: req.targetChannel.username }, { active: false });
  res.status(204).end();
});

// ---- Moderation: timed or permanent mute/ban ----
router.post('/channels/:channel/moderation', loadChannel, async (req, res) => {
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

router.get('/channels/:channel/moderation', loadChannel, async (req, res) => {
  const list = await Moderation.find({ channel: req.targetChannel.username }).sort({ createdAt: -1 });
  res.json(list);
});

router.delete('/moderation/:id', async (req, res) => {
  await Moderation.findByIdAndDelete(req.params.id);
  res.status(204).end();
});



// ---- Global class/stream operations ----
router.get('/channels/:channel', loadChannel, async (req, res) => {
  const c = req.targetChannel;
  res.json({
    channel: {
      id: c._id,
      username: c.username,
      displayName: c.displayName,
      streamTitle: c.streamTitle,
      isLive: c.isLive,
      chatEnabled: c.chatEnabled,
      chatMode: c.chatMode,
      streamKey: c.streamKey,
      rtmpServer: `${require('../config/env').publicBaseUrl || `http://${require('../config/env').serverIp}:${require('../config/env').publicPort}`}/live`,
      streamKeyField: `${c.username}?key=${c.streamKey}`,
    },
  });
});

router.post('/channels', async (req, res) => {
  const { username, displayName, streamTitle } = req.body || {};
  if (!/^[a-z0-9_]{3,24}$/i.test(username || '')) return res.status(400).json({ error: 'یوزرنیم نامعتبر است.' });
  const exists = await User.findOne({ username: username.toLowerCase() });
  if (exists) return res.status(409).json({ error: 'این نام قبلاً استفاده شده.' });
  const { generateStreamKey } = require('../utils/streamKey');
  const channel = await User.create({
    username: username.toLowerCase(),
    passwordHash: await require('../utils/password').hashPassword(require('crypto').randomBytes(32).toString('hex')),
    streamKey: generateStreamKey(),
    displayName: displayName || username,
    streamTitle: streamTitle || '',
    role: 'channel',
    managedBy: req.user.role === 'admin' ? req.user._id : null,
  });
  res.status(201).json({ id: channel._id, username: channel.username, displayName: channel.displayName, streamTitle: channel.streamTitle, streamKey: channel.streamKey });
});

router.patch('/channels/:channel', loadChannel, async (req, res) => {
  const c = req.targetChannel;
  const { displayName, streamTitle, donateUrl, chatEnabled, chatMode, autoChatMessage } = req.body || {};
  if (typeof displayName === 'string') c.displayName = displayName.slice(0, 100);
  if (typeof streamTitle === 'string') c.streamTitle = streamTitle.slice(0, 140);
  if (typeof donateUrl === 'string') c.donateUrl = donateUrl.slice(0, 300);
  if (typeof chatEnabled === 'boolean') c.chatEnabled = chatEnabled;
  if (['public', 'private'].includes(chatMode)) c.chatMode = chatMode;
  if (autoChatMessage && typeof autoChatMessage === 'object') {
    if (typeof autoChatMessage.text === 'string') c.autoChatMessage.text = autoChatMessage.text.slice(0, 200);
    if (typeof autoChatMessage.intervalMinutes === 'number') c.autoChatMessage.intervalMinutes = Math.min(120, Math.max(1, autoChatMessage.intervalMinutes));
    if (typeof autoChatMessage.enabled === 'boolean') c.autoChatMessage.enabled = autoChatMessage.enabled;
  }
  await c.save();
  chat.setChatMode(c.username, c.chatMode);
  chat.setChatEnabled(c.username, c.chatEnabled);
  if (c.isLive) chat.syncAutoReminder(c.username, c.autoChatMessage);
  res.json({ ok: true });
});

router.post('/channels/:channel/regenerate-key', loadChannel, async (req, res) => {
  const { generateStreamKey } = require('../utils/streamKey');
  req.targetChannel.streamKey = generateStreamKey();
  await req.targetChannel.save();
  res.json({ streamKey: req.targetChannel.streamKey });
});

router.get('/channels/:channel/chat-messages', loadChannel, async (req, res) => {
  const ChatMessage = require('../models/ChatMessage');
  const rows = await ChatMessage.find({ channel: req.targetChannel.username }).sort({ createdAt: -1 }).limit(200).lean();
  res.json(rows.reverse());
});

router.post('/channels/:channel/mute-student', loadChannel, async (req, res) => {
  const { externalUserId, minutes, scope = 'timed', reason = '' } = req.body || {};
  if (!externalUserId || !['timed', 'permanent'].includes(scope)) return res.status(400).json({ error: 'ورودی نامعتبر.' });
  const doc = await Moderation.create({ channel: req.targetChannel.username, externalUserId: String(externalUserId), type: 'mute', scope, expiresAt: scope === 'timed' ? new Date(Date.now() + Math.max(1, Number(minutes || 1)) * 60000) : null, reason, createdBy: String(req.user._id) });
  res.status(201).json(doc);
});

router.post('/channels/:channel/ban-student', loadChannel, async (req, res) => {
  const { externalUserId, minutes, scope = 'timed', reason = '' } = req.body || {};
  if (!externalUserId || !['timed', 'permanent'].includes(scope)) return res.status(400).json({ error: 'ورودی نامعتبر.' });
  const doc = await Moderation.create({ channel: req.targetChannel.username, externalUserId: String(externalUserId), type: 'ban', scope, expiresAt: scope === 'timed' ? new Date(Date.now() + Math.max(1, Number(minutes || 1)) * 60000) : null, reason, createdBy: String(req.user._id) });
  res.status(201).json(doc);
});

router.use(require('./poll.routes')); // adds /channels/:channel/polls, /polls/:id/... (same auth as above)

module.exports = router;
