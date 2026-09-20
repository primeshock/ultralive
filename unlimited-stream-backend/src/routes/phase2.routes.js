const express = require('express');
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const Class = require('../models/Class');
const LiveSession = require('../models/LiveSession');
const Attendance = require('../models/Attendance');
const AdminNote = require('../models/AdminNote');
const Moderation = require('../models/Moderation');
const Student = require('../models/Student');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'owner'));

function idOrSlug(value) {
  const text = String(value || '').trim().toLowerCase();
  const filters = [{ slug: text }];
  if (text) filters.push({ channel: text });
  if (mongoose.isValidObjectId(value)) filters.unshift({ _id: value });
  return { $or: filters };
}

function canManageClass(req, classDoc) {
  return req.user.role === 'owner' || String(classDoc.ownerId || '') === String(req.user._id);
}

async function loadClass(req, res, next) {
  const classDoc = await Class.findOne(idOrSlug(req.params.classId));
  if (!classDoc) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  if (!canManageClass(req, classDoc)) return res.status(403).json({ error: 'به این کلاس دسترسی ندارید.' });
  req.classDoc = classDoc;
  next();
}

function serializeClass(classDoc) {
  return {
    id: classDoc._id,
    title: classDoc.title,
    slug: classDoc.slug,
    description: classDoc.description,
    visibility: classDoc.visibility,
    settings: classDoc.settings,
    ownerId: classDoc.ownerId,
    createdAt: classDoc.createdAt,
    updatedAt: classDoc.updatedAt,
  };
}

function normalizedClassPayload(body = {}) {
  return {
    title: String(body.title || '').trim(),
    slug: String(body.slug || '').trim().toLowerCase(),
    description: String(body.description || '').trim(),
    visibility: body.visibility === 'public' ? 'public' : 'private',
    channel: String(body.channel || body.slug || '').trim().toLowerCase(),
    settings: body.settings && typeof body.settings === 'object' ? body.settings : {},
  };
}

router.get('/classes', async (req, res) => {
  const filter = req.user.role === 'owner' ? {} : { ownerId: req.user._id };
  const classes = await Class.find(filter).sort({ createdAt: -1 });
  res.json(classes.map(serializeClass));
});

router.post('/classes', async (req, res) => {
  const payload = normalizedClassPayload(req.body);
  if (!payload.title || !payload.slug) {
    return res.status(400).json({ error: 'عنوان و slug الزامی هستند.' });
  }
  const classDoc = await Class.create({ ...payload, ownerId: req.user._id });
  res.status(201).json(serializeClass(classDoc));
});

router.patch('/classes/:classId', loadClass, async (req, res) => {
  const payload = normalizedClassPayload({ ...req.classDoc.toObject(), ...req.body });
  if (!payload.title || !payload.slug) {
    return res.status(400).json({ error: 'عنوان و slug الزامی هستند.' });
  }
  Object.assign(req.classDoc, payload);
  await req.classDoc.save();
  res.json(serializeClass(req.classDoc));
});

router.delete('/classes/:classId', loadClass, async (req, res) => {
  const sessions = await LiveSession.find({ classId: req.classDoc._id }).select('_id').lean();
  const sessionIds = sessions.map((session) => session._id);
  await Promise.all([
    Attendance.deleteMany({ sessionId: { $in: sessionIds } }),
    AdminNote.deleteMany({ classId: req.classDoc._id }),
    LiveSession.deleteMany({ classId: req.classDoc._id }),
    Class.deleteOne({ _id: req.classDoc._id }),
  ]);
  res.json({ ok: true });
});

router.get('/classes/:classId', loadClass, async (req, res) => {
  res.json(serializeClass(req.classDoc));
});

router.get('/classes/:classId/sessions', loadClass, async (req, res) => {
  const sessions = await LiveSession.find({ classId: req.classDoc._id }).sort({ startedAt: -1 }).limit(100);
  res.json(sessions);
});

router.post('/classes/:classId/sessions', loadClass, async (req, res) => {
  const status = ['scheduled', 'live', 'ended'].includes(req.body?.status) ? req.body.status : 'scheduled';
  const startedAt = req.body?.startedAt ? new Date(req.body.startedAt) : status === 'live' ? new Date() : null;
  const endedAt = req.body?.endedAt ? new Date(req.body.endedAt) : status === 'ended' ? new Date() : null;
  if ((startedAt && Number.isNaN(startedAt.getTime())) || (endedAt && Number.isNaN(endedAt.getTime()))) {
    return res.status(400).json({ error: 'تاریخ یا زمان جلسه نامعتبر است.' });
  }
  if (startedAt && endedAt && endedAt <= startedAt) {
    return res.status(400).json({ error: 'زمان پایان باید بعد از زمان شروع باشد.' });
  }
  const session = await LiveSession.create({
    classId: req.classDoc._id,
    status,
    startedAt,
    endedAt,
    metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {},
  });
  res.status(201).json(session);
});

router.get('/sessions/:sessionId/attendance', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.sessionId)) return res.status(404).json({ error: 'جلسه پیدا نشد.' });
  const session = await LiveSession.findById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'جلسه پیدا نشد.' });
  const classDoc = await Class.findById(session.classId);
  if (!classDoc) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  if (!canManageClass(req, classDoc)) return res.status(403).json({ error: 'به این جلسه دسترسی ندارید.' });
  const attendance = await Attendance.find({ sessionId: session._id }).populate('studentId').sort({ joinedAt: 1 });
  res.json(attendance);
});

router.get('/classes/:classId/notes', loadClass, async (req, res) => {
  const notes = await AdminNote.find({ classId: req.classDoc._id }).sort({ createdAt: -1 }).populate('authorId', 'username displayName role');
  res.json(notes);
});

router.post('/classes/:classId/notes', loadClass, async (req, res) => {
  const content = String(req.body?.content || '').trim();
  if (!content || content.length > 5000) return res.status(400).json({ error: 'متن یادداشت نامعتبر است.' });
  const note = await AdminNote.create({ classId: req.classDoc._id, authorId: req.user._id, content });
  await note.populate('authorId', 'username displayName role');
  res.status(201).json(note);
});

router.get('/classes/:classId/moderation', loadClass, async (req, res) => {
  const list = await Moderation.find({ classId: req.classDoc._id }).sort({ createdAt: -1 }).populate('studentId', 'externalId name');
  res.json(list);
});

router.post('/classes/:classId/moderation', loadClass, async (req, res) => {
  const { studentId, type, scope, minutes, reason } = req.body || {};
  if (!mongoose.isValidObjectId(studentId) || !['mute', 'ban'].includes(type) || !['timed', 'permanent'].includes(scope)) {
    return res.status(400).json({ error: 'ورودی محدودیت نامعتبر است.' });
  }
  if (scope === 'timed' && (!Number.isFinite(Number(minutes)) || Number(minutes) < 1)) {
    return res.status(400).json({ error: 'مدت محدودیت نامعتبر است.' });
  }
  const student = await Student.findById(studentId).select('externalId name');
  if (!student) return res.status(404).json({ error: 'دانش‌آموز پیدا نشد.' });
  const moderation = await Moderation.create({
    classId: req.classDoc._id,
    studentId: student._id,
    externalUserId: student.externalId,
    type,
    scope,
    expiresAt: scope === 'timed' ? new Date(Date.now() + Number(minutes) * 60_000) : null,
    reason: String(reason || '').trim(),
    createdBy: String(req.user._id),
  });
  await moderation.populate('studentId', 'externalId name');
  res.status(201).json(moderation);
});

router.delete('/classes/:classId/moderation/:moderationId', loadClass, async (req, res) => {
  const moderation = await Moderation.findOne({ _id: req.params.moderationId, classId: req.classDoc._id });
  if (!moderation) return res.status(404).json({ error: 'محدودیت پیدا نشد.' });
  await moderation.deleteOne();
  res.status(204).end();
});

module.exports = router;