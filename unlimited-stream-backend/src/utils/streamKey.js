const crypto = require('crypto');

function generateStreamKey() {
  return crypto.randomBytes(20).toString('hex');
}

module.exports = { generateStreamKey };
