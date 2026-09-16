const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const { checkStudentAccess } = require('../utils/checkStudentAccess');
const { canAccessClass } = require('../utils/classAccess');
const { COOKIE_NAME, verifyToken } = require('../utils/jwt');
const { createStudentToken, createStaffToken, ensureIngress, deleteIngress, roomName } = require('../services/livekit');
const { livekitEnabled, livekitWsUrl } = require('../config/env');
const SiteSettings = require('../models/SiteSettings');
const { withLivekitSettings } = require('../utils/livekitSettings');

const router = express.Router();

// Public status check — the frontend uses this to decide whether to even
// attempt a LiveKit connection before falling back to HLS.
router.get('/status', async (_req, res) => {
  const settings = await SiteSettings.get();
  res.json({ enabled: livekitEnabled, playbackMode: settings.playbackMode || 'auto', livekit: withLivekitSettings(settings).livekit });
});

// Either a real staff login (owner/admin) or a valid student room-session
// cookie can get a subscribe-only token. Staff never gets publish rights
// here — publishing is a separate, explicit endpoint below.
router.get('/token', async (req, res) => {
  if (!livekitEnabled) return res.status(503).json({ error: 'LiveKit فعال نیست.' });
  const channel = String(req.query.channel || '').toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(channel)) return res.status(400).json({ error: 'کلاس نامعتبر است.' });
  const target = await User.findOne({ username: channel, role: 'teacher' });
  if (!target) return res.status(404).json({ error: 'کلاس پیدا نشد.' });

  const rawToken = req.cookies?.[COOKIE_NAME];
  if (rawToken) {
    try {
      const payload = verifyToken(rawToken);
      const user = await User.findById(payload.sub);
      const canAccess = user?.role === 'owner' || (user?.role === 'admin' && String(target.managedBy) === String(user._id));
      if (user && canAccess) {
        const participantToken = await createStaffToken({
          channel,
          identity: user._id.toString(),
          name: user.displayName || user.username,
        });
        return res.json({ serverUrl: livekitWsUrl, participantToken, roomName: roomName(channel), role: user.role });
      }
    } catch {
      /* not a valid staff login — fall through to the student check */
    }
  }

  if (await canAccessClass(channel, req.cookies || {})) {
    try {
    const access = await checkStudentAccess(channel, req.cookies || {});
    const participantToken = await createStudentToken({ channel, identity: access.externalUserId, name: access.displayName });
    return res.json({ serverUrl: livekitWsUrl, participantToken, roomName: roomName(channel), role: 'student' });
    } catch {
      const participantToken = await createStudentToken({ channel, identity: `public:${req.cookies[`public_class_${channel}`]}`, name: 'مهمان' });
      return res.json({ serverUrl: livekitWsUrl, participantToken, roomName: roomName(channel), role: 'student' });
    }
  }
  return res.status(401).json({ error: 'برای ورود به کلاس احراز هویت لازم است.' });
});

router.get('/monitor-token/:token', async (req, res) => {
  if (!livekitEnabled) return res.status(503).json({ error: 'LiveKit فعال نیست.' });
  const monitor = await require('../models/MonitorLink').findOne({ token: req.params.token, active: true });
  if (!monitor) return res.status(404).json({ error: 'لینک مانیتور نامعتبر یا غیرفعال است.' });
  const target = await User.findOne({ username: monitor.channel, role: 'teacher' });
  if (!target) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  const participantToken = await createStudentToken({ channel: target.username, identity: `monitor:${monitor.token}`, name: `Monitor ${target.username}` });
  res.json({ serverUrl: livekitWsUrl, participantToken, channel: target.username, roomName: roomName(target.username) });
});

router.use(requireAuth, requireRole('owner', 'admin'));

router.post('/channels/:channel/ingress', async (req, res) => {
  const target = await User.findOne({ username: req.params.channel.toLowerCase(), role: 'teacher' });
  if (!target) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  res.json(await ensureIngress(target));
});

router.delete('/channels/:channel/ingress', async (req, res) => {
  const target = await User.findOne({ username: req.params.channel.toLowerCase(), role: 'teacher' });
  if (!target) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  await deleteIngress(target);
  res.status(204).end();
});

module.exports = router;
