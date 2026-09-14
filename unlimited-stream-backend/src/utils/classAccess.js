const { COOKIE_NAME, verifyToken } = require('./jwt');
const User = require('../models/User');
const { checkStudentAccess } = require('./checkStudentAccess');

async function canAccessClass(channel, cookies = {}) {
  try { if (cookies[COOKIE_NAME]) { verifyToken(cookies[COOKIE_NAME]); return true; } } catch {}
  try { await checkStudentAccess(channel, cookies); return true; } catch {}
  const teacher = await User.findOne({ username: channel, role: 'teacher' }).select('+publicAccessToken accessMode');
  return Boolean(teacher?.accessMode === 'public' && teacher.publicAccessToken && cookies[`public_class_${channel}`] === teacher.publicAccessToken);
}
module.exports = { canAccessClass };
