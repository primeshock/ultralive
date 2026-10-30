// Run with: node scripts/seed-owner.js
// Creates the super-admin (owner) account if missing, or promotes/repairs it
// if it already exists with different details. Safe to run repeatedly.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../src/models/User');

const USERNAME = process.env.SEED_OWNER_USERNAME || 'shadowstrix';
const PASSWORD = process.env.SEED_OWNER_PASSWORD;
if (!PASSWORD || PASSWORD.length < 8) {
  console.error('❌ Set SEED_OWNER_PASSWORD (at least 8 characters).');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const existing = await User.findOne({ username: USERNAME });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = 'SUPER_OWNER';
    await existing.save();
    console.log(`✅ Owner account already existed; password/role updated: ${USERNAME}`);
  } else {
    await User.create({
      username: USERNAME,
      passwordHash,
      role: 'SUPER_OWNER',
      streamKey: crypto.randomBytes(20).toString('hex'),
      displayName: USERNAME,
    });
    console.log(`✅ Owner account created: ${USERNAME}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Failed to create the owner account:', err.message);
  process.exit(1);
});
