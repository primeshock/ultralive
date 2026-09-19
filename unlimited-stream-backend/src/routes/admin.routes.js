const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const Moderation = require('../models/Moderation');
const MonitorLink = require('../models/MonitorLink');
const RoomSession = require('../models/RoomSession');
const AttendanceLog = require('../models/AttendanceLog');
const ChatMessage = require('../models/ChatMessage');
const { Poll, PollResponse } = require('../models/Poll');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const { publicBaseUrl, wpJoinSecret } = require('../config/env');
const chat = require('../services/chat');
const { hashPassword } = require('../utils/password');
const { allocateClassUsername, normalizeDisplayName, normalizeStreamTitle } = require('../utils/classIdentity');
const { uploadChannelThumbnail } = require('../controllers/user.controller');
const { thumbnailUpload } = require('../utils/upload');
const { clearChat, stopAutoReminder } = require('../services/chat');
const { deleteClassArchitecture } = require('../utils/phase2Data');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'owner'));

async function myChannels(req) {
  const filter = { role: 'teacher' };
  if (req.user.role === 'admin') filter.managedBy = req.user._id;
  return User.find(filter).select('username displayName streamTitle donateUrl streamKey livekitIngressUrl livekitStreamKey isLive chatEnabled chatMode showViewerCount managedBy');
}

router.get('/channels', async (req, res) => res.json(await myChannels(req)));

async function loadOwnedChannel(req, res, next) {
  const filter = { username: req.params.channel.toLowerCase(), role: 'teacher' };
  if (req.user.role === 'admin') filter.managedBy = req.user._id;
  const channel = await User.findOne(filter);
  if (!channel) return res.status(404).json({ error: 'کانال پیدا نشد.' });
  req.targetChannel = channel;
  next();
}

router.post('/channels', async (req, res) => {
  const displayName = normalizeDisplayName(req.body?.displayName);
  const streamTitle = normalizeStreamTitle(req.body?.streamTitle ?? '');
  if (!displayName) return res.status(400).json({ error: 'نام کلاس لازم است (حداکثر ۸۰ کاراکتر).' });
  if (streamTitle === null) return res.status(400).json({ error: 'عنوان کلاس بیش از حد طولانی است.' });

  // Keep supporting an existing internal slug if a legacy client sends one;
  // new UI never collects a class username.
  let username;
  const requested = String(req.body?.username || '').trim().toLowerCase();
  if (requested) {
    if (!/^[a-z0-9_]{3,24}$/.test(requested)) return res.status(400).json({ error: 'شناسه داخلی کلاس نامعتبر است.' });
    if (await User.findOne({ username: requested })) return res.status(409).json({ error: 'این کلاس قبلاً ثبت شده است.' });
    username = requested;
  } else {
    username = await allocateClassUsername();
  }

  const channel = await User.create({
    username,
    passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
    streamKey: require('../utils/streamKey').generateStreamKey(),
    displayName,
    streamTitle: streamTitle || '',
    role: 'teacher',
    managedBy: req.user.role === 'admin' ? req.user._id : null,
  });
  res.status(201).json({
    username: channel.username,
    displayName: channel.displayName,
    streamTitle: channel.streamTitle,
    donateUrl: channel.donateUrl,
    streamKey: channel.streamKey,
    managedBy: channel.managedBy,
  });
});

router.patch('/channels/:channel', loadOwnedChannel, async (req, res) => {
  const { displayName, streamTitle, donateUrl } = req.body || {};
  if (displayName !== undefined) {
    const name = normalizeDisplayName(displayName);
    if (!name) return res.status(400).json({ error: 'نام کلاس لازم است (حداکثر ۸۰ کاراکتر).' });
    req.targetChannel.displayName = name;
  }
  if (streamTitle !== undefined) {
    const title = normalizeStreamTitle(streamTitle);
    if (title === null) return res.status(400).json({ error: 'عنوان کلاس بیش از حد طولانی است.' });
    req.targetChannel.streamTitle = title;
  }
  if (donateUrl !== undefined) {
    req.targetChannel.donateUrl = String(donateUrl || '').trim().slice(0, 500);
  }
  await req.targetChannel.save();
  res.json({
    username: req.targetChannel.username,
    displayName: req.targetChannel.displayName,
    streamTitle: req.targetChannel.streamTitle,
    donateUrl: req.targetChannel.donateUrl,
  });
});

router.delete('/channels/:channel', loadOwnedChannel, async (req, res) => {
  const channel = req.targetChannel.username;
  const polls = await Poll.find({ channel }).select('_id');
  const pollIds = polls.map((poll) => poll._id);

  if (pollIds.length) await PollResponse.deleteMany({ pollId: { $in: pollIds } });
  await Promise.all([
    Poll.deleteMany({ channel }),
    ChatMessage.deleteMany({ channel }),
    Moderation.deleteMany({ channel }),
    MonitorLink.deleteMany({ channel }),
    RoomSession.deleteMany({ channel }),
    AttendanceLog.deleteMany({ channel }),
  ]);
  await deleteClassArchitecture(channel);

  await req.targetChannel.deleteOne();
  res.status(204).end();
});

// ---- Chat privacy mode ----
router.post('/channels/:channel/chat-mode', loadOwnedChannel, async (req, res) => {
  const { chatMode } = req.body || {};
  if (!['public', 'private'].includes(chatMode)) return res.status(400).json({ error: 'مقدار نامعتبر.' });
  req.targetChannel.chatMode = chatMode;
  await req.targetChannel.save();
  chat.setChatMode(req.targetChannel.username, chatMode); // apply immediately, not just on next chat load
  res.json({ chatMode });
});

router.post('/channels/:channel/viewer-count', loadOwnedChannel, async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'مقدار enabled نامعتبر است.' });
  req.targetChannel.showViewerCount = req.body.enabled;
  await req.targetChannel.save();
  res.json({ showViewerCount: req.targetChannel.showViewerCount });
});

router.post('/channels/:channel/clear-chat', loadOwnedChannel, async (req, res) => {
  await clearChat(req.targetChannel.username);
  res.json({ ok: true });
});

router.post('/channels/:channel/end-session', loadOwnedChannel, async (req, res) => {
  req.targetChannel.isLive = false;
  await req.targetChannel.save();
  stopAutoReminder(req.targetChannel.username);
  await clearChat(req.targetChannel.username);
  res.json({ ok: true });
});

router.post('/channels/:channel/access', loadOwnedChannel, async (req, res) => {
  const mode = req.body?.mode;
  if (!['private', 'public'].includes(mode)) return res.status(400).json({ error: 'حالت دسترسی نامعتبر است.' });
  if (mode === 'public' && (!req.targetChannel.publicAccessToken || req.body?.regenerate)) req.targetChannel.publicAccessToken = crypto.randomBytes(24).toString('hex');
  req.targetChannel.accessMode = mode;
  await req.targetChannel.save();
  res.json({ mode, publicUrl: mode === 'public' ? `${publicBaseUrl}/api/session/public/${req.targetChannel.publicAccessToken}` : null });
});

router.post('/channels/:channel/thumbnail', loadOwnedChannel, thumbnailUpload.single('thumbnail'), uploadChannelThumbnail);

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
  const filter = { channel: req.targetChannel.username };
  if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
    filter.joinedAt = { $gte: new Date(`${req.query.date}T00:00:00.000Z`), $lt: new Date(`${req.query.date}T23:59:59.999Z`) };
  }
  const log = await AttendanceLog.find(filter).sort({ joinedAt: -1 }).limit(500);
  res.json(log);
});

router.get('/channels/:channel/attendance-dates', loadOwnedChannel, async (req, res) => {
  const dates = await AttendanceLog.aggregate([
    { $match: { channel: req.targetChannel.username } },
    { $project: { date: { $dateToString: { format: '%Y-%m-%d', date: '$joinedAt' } } } },
    { $group: { _id: '$date' } },
    { $sort: { _id: -1 } },
  ]);
  res.json(dates.map((item) => item._id));
});

// ---- Monitor link: check the stream without logging into the panel ----
router.post('/channels/:channel/monitor-link', loadOwnedChannel, async (req, res) => {
  const token = MonitorLink.generateToken();
  const link = await MonitorLink.findOneAndUpdate(
    { channel: req.targetChannel.username },
    { token, active: true, createdBy: String(req.user._id) },
    { upsert: true, new: true }
  );
  res.json({ url: `${publicBaseUrl}/monitor/${link.token}` });
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
