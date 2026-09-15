const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { thumbnailUpload, logoUpload, isJpeg, isPng } = require('../utils/upload');
const os = require('os');
const { execSync } = require('child_process');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const LoginLog = require('../models/LoginLog');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const { hashPassword } = require('../utils/password');
const { generateStreamKey } = require('../utils/streamKey');
const { allocateClassUsername, normalizeDisplayName, normalizeStreamTitle } = require('../utils/classIdentity');
const { publicBaseUrl } = require('../config/env');

const router = express.Router();
router.use(requireAuth, requireRole('owner'));

const USERNAME_RE = /^[a-z0-9_]{3,24}$/i;

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

// ---- Branding & technical settings ----
router.get('/settings', async (_req, res) => res.json(await SiteSettings.get()));

router.patch('/settings', async (req, res) => {
  const { siteName, logoUrl, allowPublicRegister, playbackMode } = req.body || {};
  const update = {};
  if (siteName !== undefined) {
    const name = String(siteName).trim();
    if (!name || name.length > 80) return res.status(400).json({ error: 'نام سایت نامعتبر است.' });
    update.siteName = name;
  }
  if (logoUrl !== undefined) update.logoUrl = logoUrl;
  if (allowPublicRegister !== undefined) update.allowPublicRegister = Boolean(allowPublicRegister);
  if (playbackMode !== undefined && ['auto', 'livekit', 'hls'].includes(playbackMode)) update.playbackMode = playbackMode;
  const doc = await SiteSettings.findOneAndUpdate({ key: 'main' }, update, { upsert: true, new: true });
  res.json(doc);
});

router.post('/logo', logoUpload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'فایل لوگو لازم است.' });
  const png = isPng(req.file.buffer);
  const jpeg = isJpeg(req.file.buffer);
  if (!png && !jpeg) return res.status(400).json({ error: 'لوگو باید PNG یا JPG باشد.' });
  const dir = path.join(process.cwd(), 'media');
  await fs.mkdir(dir, { recursive: true });
  const nextFile = path.join(dir, png ? 'site-logo.png' : 'site-logo.jpg');
  const staleFile = path.join(dir, png ? 'site-logo.jpg' : 'site-logo.png');
  await fs.writeFile(nextFile, req.file.buffer);
  await fs.unlink(staleFile).catch(() => {});
  const current = await SiteSettings.get();
  const logoVersion = (current.logoVersion || 0) + 1;
  const settings = await SiteSettings.findOneAndUpdate(
    { key: 'main' },
    { logoUrl: `${publicBaseUrl}/site-logo?v=${logoVersion}`, logoVersion },
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

// ---- User stats: recent logins/logouts across all real accounts ----
router.get('/activity', async (_req, res) => {
  const log = await LoginLog.find().sort({ at: -1 }).limit(300);
  res.json(log);
});

module.exports = router;
