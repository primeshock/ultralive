const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const User = require('../models/User');
const Student = require('../models/Student');
const StudentGroup = require('../models/StudentGroup');
const Class = require('../models/Class');
const ClassEnrollment = require('../models/ClassEnrollment');
const Organization = require('../models/Organization');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateStreamKey } = require('../utils/streamKey');
const { isSuperOwner } = require('../utils/organizationScope');
const { logoUpload, isPng } = require('../utils/upload');
const fs = require('fs/promises');
const path = require('path');

const router = express.Router();
const STAFF_ROLES = ['SUPER_OWNER', 'ORGANIZATION_OWNER', 'ADMIN_L1', 'ADMIN_L2'];
const ADMIN_ROLES = ['ADMIN_L1', 'ADMIN_L2'];
const USERNAME_RE = /^[a-z0-9_]{3,24}$/i;
const APPEARANCE_KEYS = ['preset', 'backgroundDarkness', 'glassOpacity', 'glassBlur', 'glowIntensity', 'backgroundUrl', 'accentColor', 'panelColor'];

router.use(requireAuth, requireRole(...STAFF_ROLES));

function organizationIdFor(req) {
  if (isSuperOwner(req.user)) return req.organizationContext?._id || null;
  return req.user.organizationId || null;
}

function requireOrganization(req, res) {
  const organizationId = organizationIdFor(req);
  if (!organizationId) {
    res.status(400).json({ error: 'ابتدا سازمان را انتخاب کنید.' });
    return null;
  }
  return organizationId;
}

function canManageAdmin(req, admin) {
  if (!admin || String(admin.organizationId) !== String(organizationIdFor(req))) return false;
  if (req.user.role === 'ORGANIZATION_OWNER' || isSuperOwner(req.user)) return ADMIN_ROLES.includes(admin.role);
  return req.user.role === 'ADMIN_L1' && admin.role === 'ADMIN_L2' && String(admin.parentAdminId) === String(req.user._id);
}

function canManageStudents(req) {
  return STAFF_ROLES.includes(req.user.role);
}

function cleanAppearance(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(APPEARANCE_KEYS.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
}

function serializeAdmin(admin) {
  return { id: admin._id, username: admin.username, displayName: admin.displayName, role: admin.role, status: admin.status, parentAdminId: admin.parentAdminId, createdAt: admin.createdAt };
}

function serializeStudent(student) {
  return {
    id: student._id,
    externalId: student.externalId,
    name: student.name,
    username: student.userId?.username || student.username,
    status: student.status,
    organizationId: student.organizationId,
    groups: student.groups || [],
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}

async function loadStudent(req, res) {
  const organizationId = requireOrganization(req, res);
  if (!organizationId || !mongoose.isValidObjectId(req.params.id)) return null;
  const student = await Student.findOne({ _id: req.params.id, organizationId }).populate('userId', 'username displayName status');
  if (!student) res.status(404).json({ error: 'دانش‌آموز پیدا نشد.' });
  return student;
}

async function loadGroup(req, res) {
  const organizationId = requireOrganization(req, res);
  if (!organizationId || !mongoose.isValidObjectId(req.params.id)) return null;
  const group = await StudentGroup.findOne({ _id: req.params.id, organizationId });
  if (!group) res.status(404).json({ error: 'گروه پیدا نشد.' });
  return group;
}

async function loadClass(req, res) {
  const organizationId = requireOrganization(req, res);
  if (!organizationId || !mongoose.isValidObjectId(req.params.classId)) return null;
  const classDoc = await Class.findOne({ _id: req.params.classId, organizationId });
  if (!classDoc) res.status(404).json({ error: 'کلاس پیدا نشد.' });
  return classDoc;
}

router.get('/settings', async (req, res) => {
  const organizationId = requireOrganization(req, res);
  if (!organizationId) return;
  const organization = await Organization.findById(organizationId).select('name slug status logoVersion classAppearance guestAccessDefault');
  if (!organization) return res.status(404).json({ error: 'سازمان پیدا نشد.' });
  res.json({ organization, logoUrl: organization.logoVersion ? `/api/organization-logos/${organization._id}.png?v=${organization.logoVersion}` : null });
});

router.patch('/settings', async (req, res) => {
  const organizationId = requireOrganization(req, res);
  if (!organizationId) return;
  const organization = await Organization.findById(organizationId);
  if (!organization) return res.status(404).json({ error: 'سازمان پیدا نشد.' });
  if (req.body?.classAppearance !== undefined) organization.classAppearance = cleanAppearance(req.body.classAppearance);
  if (typeof req.body?.guestAccessDefault === 'boolean') organization.guestAccessDefault = req.body.guestAccessDefault;
  await organization.save();
  res.json({ organization, logoUrl: organization.logoVersion ? `/api/organization-logos/${organization._id}.png?v=${organization.logoVersion}` : null });
});

router.post('/logo', logoUpload.single('logo'), async (req, res) => {
  const organizationId = requireOrganization(req, res);
  if (!organizationId) return;
  if (!req.file || !isPng(req.file.buffer)) return res.status(400).json({ error: 'فایل PNG سازمان لازم است.' });
  const organization = await Organization.findById(organizationId);
  if (!organization) return res.status(404).json({ error: 'سازمان پیدا نشد.' });
  const dir = path.join(process.cwd(), 'media', 'organizations');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${organization._id}.png`), req.file.buffer);
  organization.logoVersion += 1;
  await organization.save();
  res.json({ logoUrl: `/api/organization-logos/${organization._id}.png?v=${organization.logoVersion}`, organization });
});

router.get('/admins', async (req, res) => {
  const organizationId = requireOrganization(req, res);
  if (!organizationId) return;
  const filter = { organizationId, role: { $in: ADMIN_ROLES } };
  if (req.user.role === 'ADMIN_L1') filter.parentAdminId = req.user._id;
  res.json((await User.find(filter).sort({ createdAt: -1 })).map(serializeAdmin));
});

router.post('/admins', async (req, res) => {
  const organizationId = requireOrganization(req, res);
  if (!organizationId) return;
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = req.body?.password;
  const role = req.body?.role === 'ADMIN_L2' ? 'ADMIN_L2' : 'ADMIN_L1';
  if (!USERNAME_RE.test(username) || typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'یوزرنیم معتبر و رمز حداقل ۸ کاراکتر لازم است.' });
  if (role === 'ADMIN_L1' && !['ORGANIZATION_OWNER', 'SUPER_OWNER'].includes(req.user.role)) return res.status(403).json({ error: 'فقط مالک سازمان می‌تواند مدیر سطح اول بسازد.' });
  if (role === 'ADMIN_L2' && !['ORGANIZATION_OWNER', 'ADMIN_L1', 'SUPER_OWNER'].includes(req.user.role)) return res.status(403).json({ error: 'شما اجازه ساخت این سطح مدیر را ندارید.' });
  if (await User.findOne({ username })) return res.status(409).json({ error: 'این یوزرنیم قبلاً استفاده شده است.' });
  const admin = await User.create({ username, passwordHash: await hashPassword(password), streamKey: generateStreamKey(), displayName: username, role, organizationId, parentAdminId: role === 'ADMIN_L2' && req.user.role === 'ADMIN_L1' ? req.user._id : null });
  res.status(201).json(serializeAdmin(admin));
});

router.patch('/admins/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'مدیر پیدا نشد.' });
  const admin = await User.findById(req.params.id);
  if (!canManageAdmin(req, admin)) return res.status(404).json({ error: 'مدیر پیدا نشد.' });
  const { username, password, displayName, status } = req.body || {};
  if (username !== undefined) {
    const next = String(username).trim().toLowerCase();
    if (!USERNAME_RE.test(next)) return res.status(400).json({ error: 'یوزرنیم نامعتبر است.' });
    if (await User.findOne({ username: next, _id: { $ne: admin._id } })) return res.status(409).json({ error: 'این یوزرنیم قبلاً استفاده شده است.' });
    admin.username = next;
  }
  if (displayName !== undefined) admin.displayName = String(displayName).trim().slice(0, 80);
  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'رمز عبور حداقل ۸ کاراکتر لازم است.' });
    admin.passwordHash = await hashPassword(password);
  }
  if (status !== undefined) {
    if (!['ACTIVE', 'DISABLED'].includes(status)) return res.status(400).json({ error: 'وضعیت نامعتبر است.' });
    admin.status = status;
  }
  await admin.save();
  res.json(serializeAdmin(admin));
});

router.delete('/admins/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'مدیر پیدا نشد.' });
  const admin = await User.findById(req.params.id);
  if (!canManageAdmin(req, admin)) return res.status(404).json({ error: 'مدیر پیدا نشد.' });
  await User.deleteOne({ _id: admin._id });
  res.json({ ok: true });
});

router.get('/students', async (req, res) => {
  const organizationId = requireOrganization(req, res);
  if (!organizationId) return;
  const query = String(req.query?.q || '').trim();
  const filter = { organizationId };
  if (query) filter.$or = [{ name: new RegExp(query, 'i') }, { externalId: new RegExp(query, 'i') }];
  res.json((await Student.find(filter).populate('userId', 'username status').sort({ createdAt: -1 })).map(serializeStudent));
});

router.post('/students', async (req, res) => {
  const organizationId = requireOrganization(req, res);
  if (!organizationId || !canManageStudents(req)) return;
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = req.body?.password;
  const externalId = String(req.body?.externalId || username).trim();
  const name = String(req.body?.name || username).trim();
  if (!USERNAME_RE.test(username) || typeof password !== 'string' || password.length < 8 || !externalId || !name) return res.status(400).json({ error: 'نام کاربری، نام، شناسه و رمز معتبر لازم است.' });
  if (await User.findOne({ username })) return res.status(409).json({ error: 'این یوزرنیم قبلاً استفاده شده است.' });
  if (await Student.findOne({ externalId, organizationId })) return res.status(409).json({ error: 'این شناسه دانش‌آموز قبلاً استفاده شده است.' });
  const user = await User.create({ username, passwordHash: await hashPassword(password), streamKey: generateStreamKey(), displayName: name, role: 'STUDENT', organizationId });
  try {
    const student = await Student.create({ externalId, name, userId: user._id, organizationId });
    await student.populate('userId', 'username status');
    res.status(201).json(serializeStudent(student));
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    if (error.code === 11000) return res.status(409).json({ error: 'شناسه دانش‌آموز قبلاً استفاده شده است.' });
    throw error;
  }
});

router.patch('/students/:id', async (req, res) => {
  const student = await loadStudent(req, res);
  if (!student) return;
  const user = student.userId;
  if (req.body?.name !== undefined) { student.name = String(req.body.name).trim().slice(0, 160); if (user) user.displayName = student.name; }
  if (req.body?.externalId !== undefined) {
    const externalId = String(req.body.externalId).trim();
    if (!externalId) return res.status(400).json({ error: 'شناسه دانش‌آموز لازم است.' });
    const exists = await Student.findOne({ externalId, organizationId: student.organizationId, _id: { $ne: student._id } });
    if (exists) return res.status(409).json({ error: 'این شناسه قبلاً استفاده شده است.' });
    student.externalId = externalId;
  }
  if (req.body?.status !== undefined) { if (!['ACTIVE', 'DISABLED'].includes(req.body.status)) return res.status(400).json({ error: 'وضعیت نامعتبر است.' }); student.status = req.body.status; if (user) user.status = req.body.status; }
  if (req.body?.password !== undefined) { if (typeof req.body.password !== 'string' || req.body.password.length < 8) return res.status(400).json({ error: 'رمز حداقل ۸ کاراکتر لازم است.' }); if (user) user.passwordHash = await hashPassword(req.body.password); }
  await student.save(); if (user) await user.save(); await student.populate('userId', 'username status');
  res.json(serializeStudent(student));
});

router.delete('/students/:id', async (req, res) => {
  const student = await loadStudent(req, res);
  if (!student) return;
  await Promise.all([ClassEnrollment.deleteMany({ studentId: student._id }), StudentGroup.updateMany({ organizationId: student.organizationId }, { $pull: { studentIds: student._id } }), Student.deleteOne({ _id: student._id }), student.userId?._id ? User.deleteOne({ _id: student.userId._id }) : Promise.resolve()]);
  res.json({ ok: true });
});

router.get('/groups', async (req, res) => {
  const organizationId = requireOrganization(req, res);
  if (!organizationId) return;
  res.json(await StudentGroup.find({ organizationId }).populate('studentIds', 'name externalId status').sort({ name: 1 }));
});

router.post('/groups', async (req, res) => {
  const organizationId = requireOrganization(req, res);
  if (!organizationId) return;
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 120) return res.status(400).json({ error: 'نام گروه نامعتبر است.' });
  try { res.status(201).json(await StudentGroup.create({ organizationId, name })); } catch (error) { if (error.code === 11000) return res.status(409).json({ error: 'این گروه قبلاً ساخته شده است.' }); throw error; }
});

router.patch('/groups/:id', async (req, res) => { const group = await loadGroup(req, res); if (!group) return; const name = String(req.body?.name || '').trim(); if (!name) return res.status(400).json({ error: 'نام گروه لازم است.' }); group.name = name; await group.save(); res.json(group); });
router.delete('/groups/:id', async (req, res) => { const group = await loadGroup(req, res); if (!group) return; await group.deleteOne(); res.json({ ok: true }); });

router.post('/groups/:id/students', async (req, res) => {
  const group = await loadGroup(req, res); if (!group) return;
  const student = await Student.findOne({ _id: req.body?.studentId, organizationId: group.organizationId });
  if (!student) return res.status(404).json({ error: 'دانش‌آموز پیدا نشد.' });
  await StudentGroup.updateOne({ _id: group._id }, { $addToSet: { studentIds: student._id } });
  res.json(await StudentGroup.findById(group._id).populate('studentIds', 'name externalId status'));
});
router.delete('/groups/:id/students/:studentId', async (req, res) => { const group = await loadGroup(req, res); if (!group) return; await StudentGroup.updateOne({ _id: group._id }, { $pull: { studentIds: req.params.studentId } }); res.json({ ok: true }); });

router.get('/classes/:classId/students', async (req, res) => { const classDoc = await loadClass(req, res); if (!classDoc) return; const enrollments = await ClassEnrollment.find({ classId: classDoc._id, organizationId: classDoc.organizationId }).populate('studentId', 'name externalId status').sort({ createdAt: -1 }); res.json(enrollments); });
router.post('/classes/:classId/students', async (req, res) => { const classDoc = await loadClass(req, res); if (!classDoc) return; const student = await Student.findOne({ _id: req.body?.studentId, organizationId: classDoc.organizationId }); if (!student) return res.status(404).json({ error: 'دانش‌آموز پیدا نشد.' }); try { const enrollment = await ClassEnrollment.create({ classId: classDoc._id, studentId: student._id, organizationId: classDoc.organizationId, assignedBy: req.user._id }); await enrollment.populate('studentId', 'name externalId status'); res.status(201).json(enrollment); } catch (error) { if (error.code === 11000) return res.status(409).json({ error: 'دانش‌آموز قبلاً به کلاس دسترسی دارد.' }); throw error; } });
router.delete('/classes/:classId/students/:studentId', async (req, res) => { const classDoc = await loadClass(req, res); if (!classDoc) return; await ClassEnrollment.deleteOne({ classId: classDoc._id, studentId: req.params.studentId, organizationId: classDoc.organizationId }); res.json({ ok: true }); });

router.get('/me/security', (req, res) => res.json({ username: req.user.username }));
router.patch('/me/security', async (req, res) => { const { currentPassword, password, username } = req.body || {}; if (username === undefined && password === undefined) return res.status(400).json({ error: 'تغییری برای ذخیره وجود ندارد.' }); if (password !== undefined) { if (!(await comparePassword(String(currentPassword || ''), req.user.passwordHash))) return res.status(401).json({ error: 'رمز فعلی نادرست است.' }); if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'رمز جدید حداقل ۸ کاراکتر لازم است.' }); req.user.passwordHash = await hashPassword(password); } if (username !== undefined) { const next = String(username).trim().toLowerCase(); if (!USERNAME_RE.test(next)) return res.status(400).json({ error: 'یوزرنیم نامعتبر است.' }); if (await User.findOne({ username: next, _id: { $ne: req.user._id } })) return res.status(409).json({ error: 'این یوزرنیم قبلاً استفاده شده است.' }); req.user.username = next; } await req.user.save(); res.json({ username: req.user.username, role: req.user.role }); });

module.exports = router;
