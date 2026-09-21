const User = require('../models/User');
const Class = require('../models/Class');
const { isSuperOwner, organizationFilter } = require('./organizationScope');

function normalizeStreamName(value) {
  return String(value || '').trim().toLowerCase();
}

function identityFilter(value) {
  const name = normalizeStreamName(value);
  return { $or: [{ slug: name }, { channel: name }] };
}

function isClassTarget(target) {
  return target?.constructor?.modelName === 'Class';
}

function streamName(target) {
  return normalizeStreamName(target?.username || target?.slug);
}

function streamDisplayName(target) {
  return target?.displayName || target?.title || streamName(target);
}

function streamTitle(target) {
  return target?.streamTitle || target?.title || streamDisplayName(target);
}

function matchesOrganizationScope(target, scope) {
  if (!scope || !Object.prototype.hasOwnProperty.call(scope, 'organizationId')) return true;
  return String(target.organizationId || '') === String(scope.organizationId || '');
}

async function findStreamTarget(value, { scope = null } = {}) {
  const name = normalizeStreamName(value);
  if (!name) return null;

  const classDoc = await Class.findOne(identityFilter(name)).select('+streamKey +publicAccessToken');
  if (classDoc) return matchesOrganizationScope(classDoc, scope) ? classDoc : null;

  const userFilter = { username: name, role: 'teacher' };
  if (scope && Object.prototype.hasOwnProperty.call(scope, 'organizationId')) {
    userFilter.organizationId = scope.organizationId;
  }
  return User.findOne(userFilter).select('+publicAccessToken');
}

async function findScopedStreamTarget(req, value) {
  return findStreamTarget(value, { scope: organizationFilter(req) });
}

function canManageStreamTarget(req, target) {
  if (!target) return false;
  if (isClassTarget(target)) {
    if (isSuperOwner(req.user)) {
      return String(target.organizationId || '') === String(req.organizationContext?._id || '') || (!req.organizationContext && !target.organizationId);
    }
    return String(target.organizationId || '') === String(req.user.organizationId || '')
      && (String(target.ownerId || '') === String(req.user._id) || ['ORGANIZATION_OWNER', 'ADMIN_L1', 'ADMIN_L2'].includes(req.user.role));
  }
  if (isSuperOwner(req.user)) {
    return String(target.organizationId || '') === String(req.organizationContext?._id || '') || (!req.organizationContext && !target.organizationId);
  }
  return req.user.role === 'admin' && String(target.managedBy || '') === String(req.user._id);
}

module.exports = {
  normalizeStreamName,
  isClassTarget,
  streamName,
  streamDisplayName,
  streamTitle,
  findStreamTarget,
  findScopedStreamTarget,
  canManageStreamTarget,
};
