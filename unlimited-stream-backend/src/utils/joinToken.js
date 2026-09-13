const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { wpJoinSecret, roomSessionSecret } = require('../config/env');

/**
 * WordPress token format: base64url(JSON payload) + "." + hex(HMAC-SHA256).
 * Payload: { channel, userId, displayName, exp }  (exp = unix seconds, keep short: 60-120s)
 */
function verifyWpToken(token) {
  const [payloadB64, sig] = String(token || '').split('.');
  if (!payloadB64 || !sig) throw new Error('malformed token');

  const expected = crypto.createHmac('sha256', wpJoinSecret).update(payloadB64).digest('hex');
  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('bad signature');
  }

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  if (!payload.exp || Date.now() / 1000 > payload.exp) throw new Error('token expired');
  return payload;
}

function signRoomSession({ channel, externalUserId, sessionId, deviceId }) {
  return jwt.sign({ channel, externalUserId, sessionId, deviceId }, roomSessionSecret, { expiresIn: '6h' });
}

function verifyRoomSession(token) {
  return jwt.verify(token, roomSessionSecret);
}

module.exports = { verifyWpToken, signRoomSession, verifyRoomSession };
