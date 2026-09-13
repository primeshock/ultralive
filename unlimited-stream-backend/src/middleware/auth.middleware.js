const { COOKIE_NAME, verifyToken } = require('../utils/jwt');
const User = require('../models/User');

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
}

module.exports = { requireAuth };
