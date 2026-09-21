const { COOKIE_NAME, verifyToken } = require('./jwt');
const { checkStudentAccess } = require('./checkStudentAccess');
const { findStreamTarget } = require('./streamTarget');
const User = require('../models/User');
const ClassEnrollment = require('../models/ClassEnrollment');

async function canAccessClass(channel, cookies = {}) {
  try {
    if (cookies[COOKIE_NAME]) {
      const payload = verifyToken(cookies[COOKIE_NAME]);
      const user = await User.findById(payload.sub).select('role organizationId status');
      const target = await findStreamTarget(channel);
      if (user && user.status !== 'DISABLED' && target) {
        if (target.constructor?.modelName !== 'Class') return user.role === 'SUPER_OWNER' || user.role === 'owner' || String(target.organizationId || '') === String(user.organizationId || '') || user.role === 'teacher';
        if (['SUPER_OWNER', 'owner', 'ORGANIZATION_OWNER', 'ADMIN_L1', 'ADMIN_L2', 'admin', 'teacher'].includes(user.role)) {
          return user.role === 'SUPER_OWNER' || user.role === 'owner' || String(target.organizationId || '') === String(user.organizationId || '');
        }
        if (['STUDENT', 'student'].includes(user.role)) {
          const student = await require('../models/Student').findOne({ userId: user._id, organizationId: target.organizationId, status: 'ACTIVE' }).select('_id');
          return Boolean(student && await ClassEnrollment.exists({ classId: target._id, studentId: student._id, organizationId: target.organizationId }));
        }
      }
    }
  } catch {}
  try { await checkStudentAccess(channel, cookies); return true; } catch {}
  const target = await findStreamTarget(channel);
  if (!target) return false;
  const modes = target.accessModes?.length ? target.accessModes : target.accessMode === 'public' || target.visibility === 'public' ? ['public'] : [];
  if (target.visibility === 'public' && modes.includes('public') && !target.publicAccessToken) return true;
  return Boolean((modes.includes('public') || modes.includes('guest') || target.guestAccess) && target.publicAccessToken && cookies[`public_class_${channel}`] === target.publicAccessToken);
}
module.exports = { canAccessClass };
