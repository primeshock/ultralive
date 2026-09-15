const crypto = require('crypto');
const User = require('../models/User');

const DISPLAY_NAME_MAX = 80;
const STREAM_TITLE_MAX = 140;

async function allocateClassUsername() {
  for (let i = 0; i < 10; i++) {
    const username = `c_${crypto.randomBytes(8).toString('hex')}`;
    if (!(await User.exists({ username }))) return username;
  }
  const err = new Error('نتوانستیم شناسه داخلی کلاس را بسازیم.');
  err.status = 500;
  throw err;
}

function normalizeDisplayName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > DISPLAY_NAME_MAX) return null;
  return name;
}

function normalizeStreamTitle(value) {
  const title = String(value || '').trim();
  if (title.length > STREAM_TITLE_MAX) return null;
  return title;
}

module.exports = { allocateClassUsername, normalizeDisplayName, normalizeStreamTitle, DISPLAY_NAME_MAX, STREAM_TITLE_MAX };
