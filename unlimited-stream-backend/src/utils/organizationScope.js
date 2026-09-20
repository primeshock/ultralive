const jwt = require('jsonwebtoken');
const Organization = require('../models/Organization');
const { jwtSecret } = require('../config/env');

const CONTEXT_COOKIE = 'us_org_context';

function isSuperOwner(user) {
  return user && (user.role === 'owner' || user.role === 'SUPER_OWNER');
}

function organizationFilter(req) {
  if (isSuperOwner(req.user)) {
    return req.organizationContext ? { organizationId: req.organizationContext._id } : { organizationId: null };
  }
  return { organizationId: req.user.organizationId || null };
}

async function loadOrganizationContext(req, _res, next) {
  req.organizationContext = null;
  if (!isSuperOwner(req.user)) return next();
  const token = req.cookies?.[CONTEXT_COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, jwtSecret);
    if (String(payload.userId) !== String(req.user._id)) return next();
    req.organizationContext = await Organization.findOne({ _id: payload.organizationId, status: 'ACTIVE' });
  } catch {
    req.organizationContext = null;
  }
  next();
}

function requireOrganizationScope({ optional = false } = {}) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (isSuperOwner(req.user) && !req.organizationContext && !optional) {
      return res.status(400).json({ error: 'Organization context is required.' });
    }
    if (!isSuperOwner(req.user) && !req.user.organizationId && !optional) {
      return res.status(403).json({ error: 'Organization membership is required.' });
    }
    next();
  };
}

function signOrganizationContext(userId, organizationId) {
  return jwt.sign({ userId: String(userId), organizationId: String(organizationId) }, jwtSecret, { expiresIn: '12h' });
}

function setOrganizationContext(res, token) {
  res.cookie(CONTEXT_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 12 * 60 * 60 * 1000 });
}

module.exports = { CONTEXT_COOKIE, isSuperOwner, organizationFilter, loadOrganizationContext, requireOrganizationScope, signOrganizationContext, setOrganizationContext };