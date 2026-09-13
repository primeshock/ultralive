const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const User = require('../models/User');
const { checkStudentAccess } = require('../utils/checkStudentAccess');
const { createStudentToken, createStaffToken, ensureIngress, deleteIngress, roomName } = require('../services/livekit');

const router = express.Router();

router.get('/token', async (req, res) => {
  const channel = String(req.query.channel || '').toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(channel)) return res.status(400).json({ error: 'کلاس نامعتبر است.' });
  const target = await User.findOne({ username: channel, role: 'channel' });
  if (!target) return res.status(404).json({ error: 'کلاس پیدا نشد.' });

  if (req.cookies?.us_token) {
    // Staff token path: requireAuth is intentionally not mounted globally because students use this endpoint too.
    try {
      const jwt = require('../utils/jwt');
      const payload = jwt.verifyToken(req.cookies.us_token);
      const user = await User.findById(payload.sub);
      if (user && ['owner', 'admin'].includes(user.role)) {
        const token = await createStaffToken({ channel, identity: user._id.toString(), name: user.displayName || user.username, publish: false });
        return res.json({ serverUrl: require('../config/env').livekitWsUrl, participantToken: token, roomName: roomName(channel), role: user.role });
      }
    } catch {}
  }

  try {
    const access = await checkStudentAccess(channel, req.cookies || {});
    const token = await createStudentToken({ channel, identity: access.externalUserId, name: access.displayName });
    return res.json({ serverUrl: require('../config/env').livekitWsUrl, participantToken: token, roomName: roomName(channel), role: 'student' });
  } catch {
    return res.status(401).json({ error: 'برای ورود به کلاس احراز هویت لازم است.' });
  }
});

router.post('/publisher-token', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const channel = String(req.body?.channel || '').toLowerCase();
  const target = await User.findOne({ username: channel, role: 'channel' });
  if (!target) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  const token = await createStaffToken({ channel, identity: req.user._id.toString(), name: req.user.displayName || req.user.username, publish: true });
  res.json({ serverUrl: require('../config/env').livekitWsUrl, participantToken: token, roomName: roomName(channel) });
});

router.post('/channels/:channel/ingress', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const target = await User.findOne({ username: req.params.channel.toLowerCase(), role: 'channel' });
  if (!target) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  const info = await ensureIngress(target);
  res.json(info);
});

router.delete('/channels/:channel/ingress', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const target = await User.findOne({ username: req.params.channel.toLowerCase(), role: 'channel' });
  if (!target) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  await deleteIngress(target);
  res.status(204).end();
});

router.get('/channels/:channel/status', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const target = await User.findOne({ username: req.params.channel.toLowerCase(), role: 'channel' }).select('username isLive livekitIngressId livekitIngressUrl');
  if (!target) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  res.json({ enabled: Boolean(process.env.LIVEKIT_ENABLED === 'true'), channel: target });
});

module.exports = router;
