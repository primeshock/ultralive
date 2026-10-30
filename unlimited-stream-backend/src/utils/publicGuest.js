const crypto = require('crypto');
const { roomSessionSecret, cookieSecure } = require('../config/env');

// A visitor who entered through the public class link is a "guest": no account, but a stable per-browser id and a
// self-chosen display name, kept in one signed cookie  <id>.<base64url(name)>.<signature>.
const MAX_AGE = 12 * 60 * 60 * 1000;
const cookieName = (channel) => `public_guest_${String(channel).toLowerCase()}`;
const sign = (payload) => crypto.createHmac('sha256', roomSessionSecret).update(payload).digest('base64url').slice(0, 22);

function cleanName(value) {
  return String(value || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function readGuest(cookies, channel) {
  const raw = cookies?.[cookieName(channel)];
  if (!raw) return null;
  const [id, nameB64, sig] = String(raw).split('.');
  if (!id || !sig || sig !== sign(`${id}.${nameB64 || ''}`)) return null;
  let name = '';
  try { name = cleanName(Buffer.from(nameB64 || '', 'base64url').toString('utf8')); } catch { name = ''; }
  return { id, name };
}

function writeGuest(res, channel, { id, name }) {
  const nameB64 = Buffer.from(cleanName(name), 'utf8').toString('base64url');
  res.cookie(cookieName(channel), `${id}.${nameB64}.${sign(`${id}.${nameB64}`)}`, { httpOnly: true, sameSite: 'lax', secure: cookieSecure, maxAge: MAX_AGE });
}

const newGuestId = () => crypto.randomBytes(9).toString('hex');

module.exports = { readGuest, writeGuest, cleanName, newGuestId };
