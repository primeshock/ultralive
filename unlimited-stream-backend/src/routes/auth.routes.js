const express = require('express');
const rateLimit = require('express-rate-limit');
const { register, login, logout, me, changePassword } = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', authLimiter, register);
// No rate limit here (explicit choice) — bcrypt's own cost factor is the only
// throttle on guessing attempts against this route.
router.post('/login', authLimiter, login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.post('/change-password', requireAuth, authLimiter, changePassword);

module.exports = router;
