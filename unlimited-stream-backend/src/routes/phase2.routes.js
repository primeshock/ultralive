const express = require('express');
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const Class = require('../models/Class');
const LiveSession = require('../models/LiveSession');
const Attendance = require('../models/Attendance');
const AdminNote = require('../models/AdminNote');
const Moderation = require('../models/Moderation');
const moderationService = require('../services/moderation');
const Student = require('../models/Student');
const User = require('../models/User');
const { hashPassword } = require('../utils/password');
const { generateStreamKey } = require('../utils/streamKey');
const { organizationFilter, isSuperOwner } = require('../utils/organizationScope');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'owner', 'SUPER_OWNER', 'ORGANIZATION_OWNER', 'ADMIN_L1', 'ADMIN_L2'));

router.use((req, res, next) => {
  if (['ORGANIZATION_OWNER', 'ADMIN_L1', 'ADMIN_L2'].includes(req.user.role) && !req.user.organizationId) {
    return res.status(403).json({ error: 'حساب شما به سازمانی متصل نیست.' });
  }
  next();
});

router.post('/organization-admins/l2', async (req, res) => {
  if (!['ADMIN_L1', 'ORGANIZATION_OWNER'].includes(req.user.role)) {
    return res.status(403).json({ error: 'فقط مدیر سطح اول یا مالک سازمان می‌تواند مدیر سطح دوم بسازد.' });
  }
  if (!req.user.organizationId) return res.status(403).json({ error: 'حساب شما به سازمانی متصل نیست.' });
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = req.body?.password;
  if (!/^[a-z0-9_]{3,24}$/.test(username) || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'یوزرنیم معتبر و رمز حداقل ۸ کاراکتر لازم است.' });
  }
  if (await User.findOne({ username })) return res.status(409).json({ error: 'این یوزرنیم قبلاً استفاده شده است.' });
  const admin = await User.create({
    username,
    passwordHash: await hashPassword(password),
    streamKey: generateStreamKey(),
    displayName: username,
    role: 'ADMIN_L2',
    organizationId: req.user.organizationId,
    parentAdminId: req.user._id,
  });
  res.status(201).json({ id: admin._id, username: admin.username, role: admin.role, organizationId: admin.organizationId, parentAdminId: admin.parentAdminId });
});

router.get('/organization-admins/l2', async (req, res) => {
  if (!['ADMIN_L1', 'ORGANIZATION_OWNER'].includes(req.user.role) || !req.user.organizationId) {
    return res.status(403).json({ error: 'دسترسی به مدیران سطح دوم ندارید.' });
  }
  const filter = { role: 'ADMIN_L2', organizationId: req.user.organizationId };
  if (req.user.role === 'ADMIN_L1') filter.parentAdminId = req.user._id;
  res.json(await User.find(filter).select('username displayName status organizationId parentAdminId createdAt').sort({ createdAt: -1 }));
});

router.delete('/organization-admins/l2/:id', async (req, res) => {
  if (!['ADMIN_L1', 'ORGANIZATION_OWNER'].includes(req.user.role) || !req.user.organizationId) {
    return res.status(403).json({ error: 'دسترسی به مدیران سطح دوم ندارید.' });
  }
  const filter = { _id: req.params.id, role: 'ADMIN_L2', organizationId: req.user.organizationId };
  if (req.user.role === 'ADMIN_L1') filter.parentAdminId = req.user._id;
  const deleted = await User.deleteOne(filter);
  if (!deleted.deletedCount) return res.status(404).json({ error: 'مدیر سطح دوم پیدا نشد.' });
  res.json({ ok: true });
});

function idOrSlug(value) {
  const text = String(value || '').trim().toLowerCase();
  const filters = [{ slug: text }];
  if (text) filters.push({ channel: text });
  if (mongoose.isValidObjectId(value)) filters.unshift({ _id: value });
  return { $or: filters };
}

function canManageClass(req, classDoc) {
  if (isSuperOwner(req.user)) {
    return String(classDoc.organizationId || '') === String(req.organizationContext?._id || '') || (!req.organizationContext && !classDoc.organizationId);
  }
  return String(classDoc.organizationId || '') === String(req.user.organizationId || '') && (String(classDoc.ownerId || '') === String(req.user._id) || ['ORGANIZATION_OWNER', 'ADMIN_L1', 'ADMIN_L2'].includes(req.user.role));
}

async function loadClass(req, res, next) {
  const classDoc = await Class.findOne({ ...idOrSlug(req.params.classId), ...organizationFilter(req) });
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
    accessModes: classDoc.accessModes?.length ? classDoc.accessModes : [classDoc.visibility === 'public' ? 'public' : 'login'],
    guestAccess: Boolean(classDoc.guestAccess),
    mode: classDoc.mode || 'studio',
    settings: classDoc.settings,
    ownerId: classDoc.ownerId,
    createdAt: classDoc.createdAt,
    updatedAt: classDoc.updatedAt,
  };
}

function normalizedClassPayload(body = {}) {
  const requestedModes = Array.isArray(body.accessModes) ? body.accessModes.filter((mode) => ['login', 'api', 'public', 'guest'].includes(mode)) : [];
  const accessModes = requestedModes.length ? [...new Set(requestedModes)] : [body.visibility === 'public' ? 'public' : 'login'];
  return {
    title: String(body.title || '').trim(),
    slug: String(body.slug || '').trim().toLowerCase(),
    description: String(body.description || '').trim(),
    visibility: body.visibility === 'public' ? 'public' : 'private',
    mode: body.mode === 'desktop' ? 'desktop' : 'studio',
    accessModes,
    guestAccess: Boolean(body.guestAccess) || accessModes.includes('guest'),
    channel: String(body.channel || body.slug || '').trim().toLowerCase(),
    settings: body.settings && typeof body.settings === 'object' ? body.settings : {},
  };
}

router.get('/classes', async (req, res) => {
  const filter = { ...organizationFilter(req) };
  if (!isSuperOwner(req.user) && !['ORGANIZATION_OWNER', 'ADMIN_L1', 'ADMIN_L2'].includes(req.user.role)) filter.ownerId = req.user._id;
  const classes = await Class.find(filter).sort({ createdAt: -1 });
  res.json(classes.map(serializeClass));
});

router.post('/classes', async (req, res) => {
  const payload = normalizedClassPayload(req.body);
  if (!payload.title || !payload.slug) {
    return res.status(400).json({ error: 'عنوان و slug الزامی هستند.' });
  }
  const guestAccess = payload.guestAccess || Boolean(req.organizationContext?.guestAccessDefault);
  const classDoc = await Class.create({
    ...payload,
    accessModes: guestAccess ? [...new Set([...payload.accessModes, 'guest'])] : payload.accessModes,
    guestAccess,
    displayName: payload.title,
    streamTitle: payload.title,
    accessMode: payload.visibility,
    ownerId: req.user._id,
    organizationId: isSuperOwner(req.user) ? req.organizationContext?._id || null : req.user.organizationId || null,
  });
  res.status(201).json(serializeClass(classDoc));
});

router.patch('/classes/:classId', loadClass, async (req, res) => {
  const payload = normalizedClassPayload({ ...req.classDoc.toObject(), ...req.body });
  if (!payload.title || !payload.slug) {
    return res.status(400).json({ error: 'عنوان و slug الزامی هستند.' });
  }
  Object.assign(req.classDoc, payload);
  req.classDoc.accessMode = payload.visibility;
  if (!req.classDoc.displayName) req.classDoc.displayName = payload.title;
  if (!req.classDoc.streamTitle) req.classDoc.streamTitle = payload.title;
  await req.classDoc.save();
  res.json(serializeClass(req.classDoc));
});

router.delete('/classes/:classId', loadClass, async (req, res) => {
  const sessions = await LiveSession.find({ classId: req.classDoc._id }).select('_id').lean();
  const sessionIds = sessions.map((session) => session._id);
  await Promise.all([
    Attendance.deleteMany({ sessionId: { $in: sessionIds } }),
    AdminNote.deleteMany({ classId: req.classDoc._id }),
    ClassEnrollment.deleteMany({ classId: req.classDoc._id }),
    LiveSession.deleteMany({ classId: req.classDoc._id }),
    Class.deleteOne({ _id: req.classDoc._id }),
  ]);
  res.json({ ok: true });
});

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
router.get('/classes/:classId/reports/attendance', loadClass, async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
  const to = req.query.to ? new Date(`${String(req.query.to)}T23:59:59.999Z`) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return res.status(400).json({ error: 'بازهٔ تاریخ نامعتبر است.' });
  const sessions = await LiveSession.find({ classId: req.classDoc._id, startedAt: { $gte: from, $lte: to } }).select('_id startedAt').lean();
  const rows = await Attendance.find({ sessionId: { $in: sessions.map((s) => s._id) } }).populate('studentId', 'externalId name').lean();
  const byStudent = new Map();
  const now = Date.now();
  for (const row of rows) {
    const id = row.studentId?.externalId || String(row.studentId);
    const entry = byStudent.get(id) || { name: row.studentId?.name || '', id, sessions: new Set(), seconds: 0, first: null, last: null };
    entry.sessions.add(String(row.sessionId));
    entry.seconds += row.leftAt ? row.duration : Math.max(0, Math.round((now - row.joinedAt.getTime()) / 1000));
    if (!entry.first || row.joinedAt < entry.first) entry.first = row.joinedAt;
    const end = row.leftAt || new Date();
    if (!entry.last || end > entry.last) entry.last = end;
    byStudent.set(id, entry);
  }
  const report = [...byStudent.values()].map((e) => ({
    name: e.name, id: e.id, sessions: e.sessions.size, totalSessions: sessions.length, minutes: Math.round(e.seconds / 60),
    percent: sessions.length ? Math.round((e.sessions.size / sessions.length) * 100) : 0, first: e.first, last: e.last,
  })).sort((a, b) => b.minutes - a.minutes);
  if (req.query.format !== 'csv') return res.json({ totalSessions: sessions.length, students: report });
  const lines = [['نام', 'شناسه', 'جلسات حاضر', 'کل جلسات', 'درصد حضور', 'مجموع دقیقه', 'اولین ورود', 'آخرین خروج'].map(csvCell).join(',')];
  for (const r of report) lines.push([r.name, r.id, r.sessions, r.totalSessions, `${r.percent}%`, r.minutes, r.first?.toISOString() || '', r.last?.toISOString() || ''].map(csvCell).join(','));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="attendance-${req.classDoc.slug}.csv"` });
  res.send(`\uFEFF${lines.join('\r\n')}`);
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
  const classDoc = await Class.findOne({ _id: session.classId, ...organizationFilter(req) });
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

// Keep enrolled, previously present, and restricted students visible after a ban.
router.get('/classes/:classId/moderation-students', loadClass, async (req, res) => {
  const classId = req.classDoc._id;
  const enrollment = await require('../models/ClassEnrollment').find({ classId }).select('studentId').lean();
  const sessions = await LiveSession.find({ classId }).select('_id').lean();
  const present = await Attendance.find({ sessionId: { $in: sessions.map((item) => item._id) } }).select('studentId').lean();
  const restrictions = await moderationService.list(req.classDoc);
  const ids = [...enrollment, ...present, ...restrictions].map((row) => row.studentId?._id || row.studentId).filter(Boolean);
  const students = await Student.find({ _id: { $in: ids }, organizationId: req.classDoc.organizationId || null }).select('externalId name').lean();
  const rows = new Map(students.map((student) => [student.externalId, student]));
  for (const item of restrictions) if (!rows.has(item.externalUserId)) rows.set(item.externalUserId, { externalId: item.externalUserId, name: item.externalUserId });
  res.json([...rows.values()]);
});

router.get('/classes/:classId/moderation', loadClass, async (req, res) => {
  const list = await moderationService.list(req.classDoc);
  res.json(list);
});

router.post('/classes/:classId/moderation', loadClass, async (req, res) => {
  const { studentId, externalUserId, type, scope, minutes, reason } = req.body || {};
  if ((!mongoose.isValidObjectId(studentId) && !externalUserId) || !['mute', 'ban'].includes(type) || !['timed', 'permanent'].includes(scope)) {
    return res.status(400).json({ error: 'ورودی محدودیت نامعتبر است.' });
  }
  if (scope === 'timed' && (!Number.isFinite(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 525600)) {
    return res.status(400).json({ error: 'مدت محدودیت نامعتبر است.' });
  }
  const student = mongoose.isValidObjectId(studentId) ? await Student.findOne({ _id: studentId, organizationId: req.classDoc.organizationId }).select('externalId name') : null;
  if (studentId && !student) return res.status(404).json({ error: 'دانش‌آموز پیدا نشد.' });
  const moderation = await moderationService.restrict(req.classDoc, student?.externalId || externalUserId, req.body, req.user._id);
  res.status(201).json(moderation);
});

router.delete('/classes/:classId/moderation/:moderationId', loadClass, async (req, res) => {
  const moderation = await Moderation.findOne({ _id: req.params.moderationId, ...moderationService.targetFilter(req.classDoc) });
  if (!moderation) return res.status(404).json({ error: 'محدودیت پیدا نشد.' });
  await moderationService.remove(req.classDoc, moderation);
  res.status(204).end();
});

module.exports = router;