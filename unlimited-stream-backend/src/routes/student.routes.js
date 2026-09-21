const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const Student = require('../models/Student');
const ClassEnrollment = require('../models/ClassEnrollment');

const router = express.Router();
router.use(requireAuth, requireRole('STUDENT', 'student'));

router.get('/me', async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id, organizationId: req.user.organizationId }).select('externalId name status organizationId');
  if (!student) return res.status(404).json({ error: 'پرونده دانش‌آموز پیدا نشد.' });
  res.json(student);
});

router.get('/classes', async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id, organizationId: req.user.organizationId, status: 'ACTIVE' }).select('_id');
  if (!student) return res.status(404).json({ error: 'پرونده دانش‌آموز پیدا نشد.' });
  const enrollments = await ClassEnrollment.find({ studentId: student._id, organizationId: req.user.organizationId }).populate('classId', 'title slug description visibility accessModes guestAccess displayName streamTitle settings organizationId').sort({ createdAt: -1 });
  res.json(enrollments.map((item) => ({ enrollmentId: item._id, class: item.classId })));
});

module.exports = router;
