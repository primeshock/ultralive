const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');

const COOKIE_NAME = 'us_token';
const EXPIRES_IN = '7d';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function signToken(userId) {
  return jwt.sign({ sub: userId }, jwtSecret, { expiresIn: EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, jwtSecret);
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // no HTTPS requirement for this deployment
    maxAge: MAX_AGE_MS,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

module.exports = { COOKIE_NAME, signToken, verifyToken, setAuthCookie, clearAuthCookie };
