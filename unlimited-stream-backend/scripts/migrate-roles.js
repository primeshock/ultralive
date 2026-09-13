const mongoose = require('mongoose');
const { mongoUri } = require('../src/config/env');

async function main() {
  await mongoose.connect(mongoUri);
  const result = await mongoose.connection.collection('users').updateMany(
    { role: 'teacher' },
    { $set: { role: 'channel' } }
  );
  await mongoose.connection.collection('siteSettings').updateOne({ key: 'main' }, { $setOnInsert: { key: 'main', allowPublicRegister: false } }, { upsert: true });
  console.log(`Migrated ${result.modifiedCount} legacy teacher account(s) to channel entities.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
