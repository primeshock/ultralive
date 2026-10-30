const { COOKIE_NAME, verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const { loadOrganizationContext } = require('../utils/organizationScope');

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'ابتدا وارد شوید.' });

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user || user.status === 'DISABLED') return res.status(401).json({ error: 'ابتدا وارد شوید.' });

    req.user = user;
    await loadOrganizationContext(req, res, next);
  } catch (err) {
    return res.status(401).json({ error: 'ابتدا وارد شوید.' });
  }
}

module.exports = { requireAuth };
