const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { logoUpload, isPng } = require('../utils/upload');
const os = require('os');
const { execSync } = require('child_process');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const LoginLog = require('../models/LoginLog');
const ChatMessage = require('../models/ChatMessage');
const Moderation = require('../models/Moderation');
const MonitorLink = require('../models/MonitorLink');
const RoomSession = require('../models/RoomSession');
const AttendanceLog = require('../models/AttendanceLog');
const { Poll, PollResponse } = require('../models/Poll');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateStreamKey } = require('../utils/streamKey');
const { allocateClassUsername, normalizeDisplayName, normalizeStreamTitle } = require('../utils/classIdentity');
const { normalizeLivekitSettings, withLivekitSettings } = require('../utils/livekitSettings');
const { publicBaseUrl } = require('../config/env');
const { ensureIngress } = require('../services/livekit');
const { telemetryHistory } = require('../services/telemetry');
const { PROFILES, listResults, getJob, startJob, stopJob } = require('../services/loadTestJobs');
const { deleteClassArchitecture } = require('../utils/phase2Data');

const router = express.Router();
router.use(requireAuth, requireRole('owner'));

const USERNAME_RE = /^[a-z0-9_]{3,24}$/i;

async function deleteClassData(channelUsername) {
  const channel = String(channelUsername || '').toLowerCase();
  if (!channel) return;

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

  await fs.unlink(path.join(process.cwd(), 'media', 'thumbnails', `${channel}.jpg`)).catch(() => {});
}

async function writePngAsset(fileName, buffer) {
  const dir = path.join(process.cwd(), 'media');
  await fs.mkdir(dir, { recursive: true });
  const nextFile = path.join(dir, fileName);
  const staleFiles = [
    nextFile.replace(/\.png$/, '.jpg'),
    nextFile.replace(/\.png$/, '.ico'),
  ];
  await fs.writeFile(nextFile, buffer);
  await Promise.all(staleFiles.map((file) => fs.unlink(file).catch(() => {})));
}

router.patch('/owner-credentials', async (req, res) => {
  const owner = req.user;
  const { username, currentPassword, password } = req.body || {};

  if (username === undefined && password === undefined) {
    return res.status(400).json({ error: 'حداقل یوزرنیم یا رمز عبور جدید لازم است.' });
  }

  if (username !== undefined) {
    if (!USERNAME_RE.test(username || '')) {
      return res.status(400).json({ error: 'یوزرنیم باید ۳ تا ۲۴ کاراکتر انگلیسی، عدد یا _ باشد.' });
    }
    const next = username.toLowerCase();
    const taken = await User.findOne({ username: next, _id: { $ne: owner._id } });
    if (taken) return res.status(409).json({ error: 'این یوزرنیم قبلاً استفاده شده.' });
    const previousUsername = owner.username;
    owner.username = next;
    if (!owner.displayName || owner.displayName === previousUsername) owner.displayName = next;
  }

  if (password !== undefined) {
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return res.status(400).json({ error: 'برای تغییر رمز، وارد کردن رمز فعلی لازم است.' });
    }
    const validCurrentPassword = await comparePassword(currentPassword, owner.passwordHash);
    if (!validCurrentPassword) return res.status(401).json({ error: 'رمز فعلی نادرست است.' });
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد.' });
    }
    owner.passwordHash = await hashPassword(password);
  }

  await owner.save();
  res.json({ id: owner._id, username: owner.username, role: owner.role });
});

// Create a new admin account.
router.post('/admins', async (req, res) => {
  const { username, password } = req.body || {};
  if (!USERNAME_RE.test(username || '') || !password || password.length < 8) {
    return res.status(400).json({ error: 'یوزرنیم (۳-۲۴ کاراکتر) و رمز عبور حداقل ۸ کاراکتر لازم است.' });
  }
  const exists = await User.findOne({ username: username.toLowerCase() });
  if (exists) return res.status(409).json({ error: 'این یوزرنیم قبلاً استفاده شده.' });

  const passwordHash = await hashPassword(password);
  const admin = await User.create({
    username: username.toLowerCase(),
    passwordHash,
    streamKey: generateStreamKey(), // unused for admins, but required by the schema
    displayName: username,
    role: 'admin',
  });
  res.status(201).json({ id: admin._id, username: admin.username, role: admin.role });
});

router.get('/admins', async (_req, res) => {
  const admins = await User.find({ role: 'admin' }).select('username displayName createdAt');
  res.json(admins.map((admin) => ({
    _id: admin._id,
    id: admin._id,
    username: admin.username,
    displayName: admin.displayName,
    createdAt: admin.createdAt,
  })));
});

router.patch('/admins/:id', async (req, res) => {
  const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
  if (!admin) return res.status(404).json({ error: 'ادمین پیدا نشد.' });

  const { username, password, displayName } = req.body || {};
  if (username === undefined && password === undefined && displayName === undefined) {
    return res.status(400).json({ error: 'حداقل یوزرنیم یا رمز عبور جدید لازم است.' });
  }
  if (username !== undefined) {
    if (!USERNAME_RE.test(username || '')) {
      return res.status(400).json({ error: 'یوزرنیم باید ۳ تا ۲۴ کاراکتر انگلیسی، عدد یا _ باشد.' });
    }
    const next = username.toLowerCase();
    const taken = await User.findOne({ username: next, _id: { $ne: admin._id } });
    if (taken) return res.status(409).json({ error: 'این یوزرنیم قبلاً استفاده شده.' });
    const previousUsername = admin.username;
    admin.username = next;
    if (!displayName && (!admin.displayName || admin.displayName === previousUsername)) admin.displayName = next;
  }
  if (displayName !== undefined) {
    const name = String(displayName).trim();
    if (!name || name.length > 80) return res.status(400).json({ error: 'نام نمایشی نامعتبر است.' });
    admin.displayName = name;
  }
  if (password !== undefined) {
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد.' });
    }
    admin.passwordHash = await hashPassword(password);
  }
  await admin.save();
  res.json({ id: admin._id, username: admin.username, displayName: admin.displayName, role: admin.role });
});

router.delete('/admins/:id', async (req, res) => {
  const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
  if (!admin) return res.status(404).json({ error: 'ادمین پیدا نشد.' });

  await User.updateMany({ role: 'teacher', managedBy: admin._id }, { $set: { managedBy: null } });
  await admin.deleteOne();
  res.status(204).end();
});

// Create a channel (= a class). Internal username is allocated automatically.
router.post('/channels', async (req, res) => {
  const { password, managedBy } = req.body || {};
  const displayName = normalizeDisplayName(req.body?.displayName || req.body?.username);
  const streamTitle = normalizeStreamTitle(req.body?.streamTitle ?? '');
  if (!displayName || !managedBy) {
    return res.status(400).json({ error: 'نام کلاس و شناسه ادمین مدیر لازم است.' });
  }
  if (streamTitle === null) return res.status(400).json({ error: 'عنوان کلاس بیش از حد طولانی است.' });
  const admin = await User.findOne({ _id: managedBy, role: 'admin' });
  if (!admin) return res.status(400).json({ error: 'ادمین مدیر پیدا نشد.' });

  let username;
  const requested = String(req.body?.username || '').trim().toLowerCase();
  if (requested && USERNAME_RE.test(requested)) {
    if (await User.findOne({ username: requested })) return res.status(409).json({ error: 'این کلاس قبلاً ثبت شده است.' });
    username = requested;
  } else {
    username = await allocateClassUsername();
  }

  const passwordHash = await hashPassword(password && password.length >= 8 ? password : require('crypto').randomBytes(32).toString('hex'));
  const channel = await User.create({
    username,
    passwordHash,
    streamKey: generateStreamKey(),
    displayName,
    streamTitle: streamTitle || '',
    role: 'teacher',
    managedBy: admin._id,
  });
  res.status(201).json({ id: channel._id, username: channel.username, displayName: channel.displayName, streamTitle: channel.streamTitle, streamKey: channel.streamKey });
});

router.get('/channels', async (_req, res) => {
  const channels = await User.find({ role: 'teacher' })
    .select('username displayName streamTitle managedBy isLive chatMode createdAt')
    .populate('managedBy', 'username');
  res.json(channels);
});

router.delete('/channels/:id', async (req, res) => {
  const channel = await User.findOne({ _id: req.params.id, role: 'teacher' });
  if (!channel) return res.status(404).json({ error: 'کلاس پیدا نشد.' });

  await deleteClassData(channel.username);
  await channel.deleteOne();
  res.status(204).end();
});

// ---- Branding & technical settings ----
router.get('/settings', async (_req, res) => res.json(withLivekitSettings(await SiteSettings.get())));

router.patch('/settings', async (req, res) => {
  const { siteName, browserTabTitle, logoUrl, allowPublicRegister, playbackMode, livekit, appearance } = req.body || {};
  const update = {};
  if (siteName !== undefined) {
    const name = String(siteName).trim();
    if (!name || name.length > 80) return res.status(400).json({ error: 'نام سایت نامعتبر است.' });
    update.siteName = name;
  }
  if (browserTabTitle !== undefined) {
    const title = String(browserTabTitle).trim();
    if (!title || title.length > 80) return res.status(400).json({ error: 'عنوان تب مرورگر نامعتبر است.' });
    update.browserTabTitle = title;
  }
  if (logoUrl !== undefined) update.logoUrl = logoUrl;
  if (allowPublicRegister !== undefined) update.allowPublicRegister = Boolean(allowPublicRegister);
  if (playbackMode !== undefined && ['auto', 'livekit', 'hls'].includes(playbackMode)) update.playbackMode = playbackMode;
  if (livekit !== undefined) update.livekit = normalizeLivekitSettings(livekit);
  if (appearance !== undefined) {
    const current = await SiteSettings.get();
    const next = { ...(current.appearance?.toObject?.() || current.appearance || {}), ...appearance };
    if (!['aurora', 'gemini', 'apple-dark', 'custom'].includes(next.preset)) return res.status(400).json({ error: 'پریست ظاهری نامعتبر است.' });
    for (const key of ['backgroundDarkness', 'glassOpacity', 'glassBlur', 'glowIntensity']) {
      const value = Number(next[key]);
      if (!Number.isFinite(value) || value < 0 || value > 100) return res.status(400).json({ error: 'مقدار تنظیمات ظاهری نامعتبر است.' });
      next[key] = value;
    }
    update.appearance = next;
  }
  const doc = await SiteSettings.findOneAndUpdate({ key: 'main' }, update, { upsert: true, new: true });
  if (livekit !== undefined) {
    const activeChannels = await User.find({ role: 'teacher', livekitIngressId: { $gt: '' } });
    const results = await Promise.allSettled(activeChannels.map((channel) => ensureIngress(channel)));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) return res.status(502).json({ error: 'اعمال تنظیمات LiveKit روی یکی از ورودی‌های فعال ناموفق بود.' });
  }
  res.json(doc);
});

router.post('/appearance/background', logoUpload.single('background'), async (req, res) => {
  if (!req.file || !isPng(req.file.buffer)) return res.status(400).json({ error: 'پس‌زمینه باید PNG واقعی باشد.' });
  await writePngAsset('site-background.png', req.file.buffer);
  const current = await SiteSettings.get();
  const backgroundVersion = (current.appearance?.backgroundVersion || 0) + 1;
  const appearance = { ...(current.appearance?.toObject?.() || current.appearance || {}), backgroundUrl: `${publicBaseUrl}/site-background?v=${backgroundVersion}`, backgroundVersion, preset: 'custom' };
  const settings = await SiteSettings.findOneAndUpdate({ key: 'main' }, { appearance }, { upsert: true, new: true });
  res.json(settings);
});

router.delete('/appearance/background', async (_req, res) => {
  await fs.unlink(path.join(process.cwd(), 'media', 'site-background.png')).catch(() => {});
  const current = await SiteSettings.get();
  const appearance = { ...(current.appearance?.toObject?.() || current.appearance || {}), backgroundUrl: '', preset: 'aurora' };
  const settings = await SiteSettings.findOneAndUpdate({ key: 'main' }, { appearance }, { upsert: true, new: true });
  res.json(settings);
});

router.post('/logo', logoUpload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'فایل لوگو لازم است.' });
  const png = isPng(req.file.buffer);
  if (!png) return res.status(400).json({ error: 'لوگو باید PNG واقعی باشد.' });
  await writePngAsset('site-logo.png', req.file.buffer);
  const current = await SiteSettings.get();
  const logoVersion = (current.logoVersion || 0) + 1;
  const settings = await SiteSettings.findOneAndUpdate(
    { key: 'main' },
    { logoUrl: `${publicBaseUrl}/site-logo?v=${logoVersion}`, logoVersion },
    { upsert: true, new: true }
  );
  res.json(settings);
});

router.post('/favicon', logoUpload.single('favicon'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'فایل favicon لازم است.' });
  const png = isPng(req.file.buffer);
  if (!png) return res.status(400).json({ error: 'favicon باید PNG واقعی باشد.' });

  await writePngAsset('site-favicon.png', req.file.buffer);
  const current = await SiteSettings.get();
  const faviconVersion = (current.faviconVersion || 0) + 1;
  const settings = await SiteSettings.findOneAndUpdate(
    { key: 'main' },
    { faviconUrl: `${publicBaseUrl}/site-favicon?v=${faviconVersion}`, faviconVersion },
    { upsert: true, new: true }
  );
  res.json(settings);
});

// ---- Server monitoring ----
router.get('/system-stats', async (_req, res) => {
  let disk = null;
  try {
    // "1M-blocks" avoids parsing locale-dependent size suffixes.
    const out = execSync("df -BM / | tail -1 | awk '{print $2, $3, $5}'").toString().trim().split(/\s+/);
    disk = { totalMb: parseInt(out[0]), usedMb: parseInt(out[1]), usedPercent: out[2] };
  } catch {
    /* df not available in this environment — skip disk stats */
  }

  let pm2 = null;
  try {
    pm2 = JSON.parse(execSync('pm2 jlist').toString()).map((p) => ({
      name: p.name,
      status: p.pm2_env?.status,
      restarts: p.pm2_env?.restart_time,
      cpu: p.monit?.cpu,
      memoryMb: p.monit?.memory ? Math.round(p.monit.memory / 1024 / 1024) : null,
    }));
  } catch {
    /* pm2 not on PATH for this process — skip */
  }

  res.json({
    uptimeSeconds: process.uptime(),
    serverUptimeSeconds: os.uptime(),
    loadavg: os.loadavg(),
    memory: { totalMb: Math.round(os.totalmem() / 1024 / 1024), freeMb: Math.round(os.freemem() / 1024 / 1024) },
    cpuCount: os.cpus().length,
    disk,
    pm2,
  });
});

router.get('/telemetry', async (_req, res) => {
  const requestedLimit = Number(_req.query.limit);
  const history = await telemetryHistory(Number.isFinite(requestedLimit) ? requestedLimit : 360);
  const latest = history.at(-1) || null;
  res.json({ current: latest, latest, history });
});

router.get('/load-tests/profiles', (_req, res) => res.json(PROFILES));

router.get('/load-tests', async (_req, res) => {
  const results = await listResults();
  res.json({ results });
});

router.get('/load-tests/:testId', async (req, res) => {
  const job = await getJob(req.params.testId);
  if (!job) return res.status(404).json({ error: 'نتیجه یا تست پیدا نشد.' });
  res.json(job);
});

router.post('/load-tests/start', async (req, res) => {
  const { profile, channel, duration, rampPerSecond, confirmLarge } = req.body || {};
  const selected = PROFILES[String(profile)];
  if (selected?.users >= 100 && confirmLarge !== true) return res.status(400).json({ error: 'برای تست‌های ۱۰۰ کاربر یا بیشتر تأیید صریح لازم است.' });
  const job = await startJob({ profile, channel, duration, rampPerSecond, authCookie: req.headers.cookie, allowLarge: confirmLarge === true });
  res.status(202).json(job);
});

router.post('/load-tests/:testId/stop', async (req, res) => {
  res.json(await stopJob(req.params.testId));
});

// ---- User stats: recent logins/logouts across all real accounts ----
router.get('/activity', async (_req, res) => {
  const log = await LoginLog.find().sort({ at: -1 }).limit(300);
  res.json(log);
});

module.exports = router;
