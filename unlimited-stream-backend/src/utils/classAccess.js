const { COOKIE_NAME, verifyToken } = require('./jwt');
const { checkStudentAccess } = require('./checkStudentAccess');
const { findStreamTarget } = require('./streamTarget');

async function canAccessClass(channel, cookies = {}) {
  try { if (cookies[COOKIE_NAME]) { verifyToken(cookies[COOKIE_NAME]); return true; } } catch {}
  try { await checkStudentAccess(channel, cookies); return true; } catch {}
  const target = await findStreamTarget(channel);
  if (!target) return false;
  if (target.visibility === 'public' && !target.publicAccessToken) return true;
  return Boolean(target.accessMode === 'public' && target.publicAccessToken && cookies[`public_class_${channel}`] === target.publicAccessToken);
}
module.exports = { canAccessClass };
