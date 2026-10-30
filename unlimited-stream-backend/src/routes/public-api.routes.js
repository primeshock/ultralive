const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const ApiKey = require('../models/ApiKey');
const Class = require('../models/Class');
const LiveSession = require('../models/LiveSession');
const Attendance = require('../models/Attendance');
const { wpJoinSecret, publicBaseUrl } = require('../config/env');

// External-site API (header X-API-Key). Lets the main website mint student join links and read attendance.
const router = express.Router();
router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

router.use(async (req, res, next) => {
  const key = String(req.get('x-api-key') || '');
  if (!/^ulk_[a-f0-9]{48}$/.test(key)) return res.status(401).json({ error: 'کلید API نامعتبر است.' });
  const doc = await ApiKey.findOne({ hash: crypto.createHash('sha256').update(key).digest('hex'), revoked: false });
  if (!doc) return res.status(401).json({ error: 'کلید API نامعتبر است.' });
  ApiKey.updateOne({ _id: doc._id }, { lastUsedAt: new Date() }).catch(() => {});
  req.apiKey = doc;
  next();
});

const classFilter = (req) => ({ organizationId: req.apiKey.organizationId || null });

router.get('/classes', async (req, res) => {
  const list = await Class.find(classFilter(req)).select('title slug mode isLive visibility createdAt').sort({ createdAt: -1 }).limit(500);
  res.json(list.map((c) => ({ slug: c.slug, title: c.title, mode: c.mode || 'studio', isLive: Boolean(c.isLive), createdAt: c.createdAt })));
});

// Returns a short-lived signed link that logs the student straight into the class.
router.post('/classes/:slug/join-link', async (req, res) => {
  if (!wpJoinSecret) return res.status(503).json({ error: 'WP_JOIN_SECRET روی سرور تنظیم نشده است.' });
  const classDoc = await Class.findOne({ slug: String(req.params.slug).toLowerCase(), ...classFilter(req) });
  if (!classDoc) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  const userId = String(req.body?.userId || '').trim().slice(0, 100);
  const displayName = String(req.body?.displayName || '').trim().slice(0, 80);
  if (!userId) return res.status(400).json({ error: 'userId لازم است.' });
  const payload = Buffer.from(JSON.stringify({ channel: classDoc.slug, userId, displayName, exp: Math.floor(Date.now() / 1000) + 120 })).toString('base64url');
  const sig = crypto.createHmac('sha256', wpJoinSecret).update(payload).digest('hex');
  res.json({ url: `${publicBaseUrl}/api/session/join?token=${payload}.${sig}`, expiresInSeconds: 120 });
});

router.get('/classes/:slug/attendance', async (req, res) => {
  const classDoc = await Class.findOne({ slug: String(req.params.slug).toLowerCase(), ...classFilter(req) });
  if (!classDoc) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  const sessions = await LiveSession.find({ classId: classDoc._id }).sort({ startedAt: -1 }).limit(100).lean();
  const rows = await Attendance.find({ sessionId: { $in: sessions.map((s) => s._id) } }).populate('studentId', 'externalId name').lean();
  res.json({ sessions: sessions.map((s) => ({ id: s._id, startedAt: s.startedAt, endedAt: s.endedAt })), attendance: rows.map((r) => ({ sessionId: r.sessionId, externalId: r.studentId?.externalId, name: r.studentId?.name, joinedAt: r.joinedAt, leftAt: r.leftAt, seconds: r.duration })) });
});

module.exports = router;
