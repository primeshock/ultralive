// Run with: node scripts/seed-owner.js
// Creates the super-admin (owner) account if missing, or promotes/repairs it
// if it already exists with different details. Safe to run repeatedly.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../src/models/User');

const USERNAME = process.env.SEED_OWNER_USERNAME;
const PASSWORD = process.env.SEED_OWNER_PASSWORD;
if (!USERNAME || !PASSWORD) {
  console.error('SEED_OWNER_USERNAME and SEED_OWNER_PASSWORD are required.');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const existing = await User.findOne({ username: USERNAME });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = 'owner';
    await existing.save();
    console.log(`✅ اکانت owner موجود بود، رمز/نقش‌اش تنظیم شد: ${USERNAME}`);
  } else {
    await User.create({
      username: USERNAME,
      passwordHash,
      role: 'owner',
      streamKey: crypto.randomBytes(20).toString('hex'),
      displayName: USERNAME,
    });
    console.log(`✅ اکانت owner ساخته شد: ${USERNAME}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ خطا در ساخت اکانت owner:', err.message);
  process.exit(1);
});
