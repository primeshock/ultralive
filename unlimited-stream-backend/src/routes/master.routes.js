const express = require('express');
const os = require('os');
const { execSync } = require('child_process');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const LoginLog = require('../models/LoginLog');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const { hashPassword } = require('../utils/password');
const { generateStreamKey } = require('../utils/streamKey');
const { livekitEnabled, livekitUrl, livekitWsUrl } = require('../config/env');

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

router.delete('/admins/:id', async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) return res.status(400).json({ error: 'نمی‌توانید خودتان را حذف کنید.' });
  const result = await User.deleteOne({ _id: req.params.id, role: 'admin' });
  if (!result.deletedCount) return res.status(404).json({ error: 'ادمین پیدا نشد.' });
  await User.updateMany({ role: 'channel', managedBy: req.params.id }, { $set: { managedBy: null } });
  res.status(204).end();
});

router.get('/admins', async (_req, res) => {
  const admins = await User.find({ role: 'admin' }).select('username displayName createdAt');
  res.json(admins);
});

router.post('/channels', async (req, res) => {
  const { username, password, managedBy, displayName, streamTitle } = req.body || {};
  if (!USERNAME_RE.test(username || '')) {
    return res.status(400).json({ error: 'یوزرنیم ۳ تا ۲۴ کاراکتر لازم است.' });
  }
  if (managedBy) {
    const admin = await User.findOne({ _id: managedBy, role: 'admin' });
    if (!admin) return res.status(400).json({ error: 'ادمین مدیر پیدا نشد.' });
  }

  const exists = await User.findOne({ username: username.toLowerCase() });
  if (exists) return res.status(409).json({ error: 'این یوزرنیم قبلاً استفاده شده.' });

  const passwordHash = await hashPassword(password || require('crypto').randomBytes(24).toString('hex'));
  const channel = await User.create({
    username: username.toLowerCase(),
    passwordHash,
    streamKey: generateStreamKey(),
    displayName: displayName || username,
    streamTitle: streamTitle || '',
    role: 'channel',
    managedBy: admin._id,
  });
  res.status(201).json({ id: channel._id, username: channel.username, streamKey: channel.streamKey });
});

router.get('/channels', async (_req, res) => {
  const channels = await User.find({ role: 'channel' })
    .select('username displayName streamTitle managedBy isLive chatMode createdAt')
    .populate('managedBy', 'username');
  res.json(channels);
});

// ---- Branding & technical settings ----
router.get('/settings', async (_req, res) => res.json(await SiteSettings.get()));

router.patch('/settings', async (req, res) => {
  const { siteName, logoUrl, faviconUrl, accentColor, allowPublicRegister } = req.body || {};
  const update = {};
  if (siteName !== undefined) update.siteName = siteName;
  if (logoUrl !== undefined) update.logoUrl = String(logoUrl).slice(0, 500);
  if (faviconUrl !== undefined) update.faviconUrl = String(faviconUrl).slice(0, 500);
  if (accentColor !== undefined) update.accentColor = String(accentColor).slice(0, 30);
  if (allowPublicRegister !== undefined) update.allowPublicRegister = Boolean(allowPublicRegister);
  const doc = await SiteSettings.findOneAndUpdate({ key: 'main' }, update, { upsert: true, new: true });
  res.json(doc);
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
    livekit: { enabled: livekitEnabled, apiUrl: livekitUrl, wsUrl: livekitWsUrl },
  });
});

// ---- User stats: recent logins/logouts across all real accounts ----
router.get('/activity', async (_req, res) => {
  const log = await LoginLog.find().sort({ at: -1 }).limit(300);
  res.json(log);
});

module.exports = router;
