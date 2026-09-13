// Use AFTER requireAuth — req.user is already the full User doc by then.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز' });
    }
    next();
  };
}

module.exports = { requireRole };
