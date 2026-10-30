// Usage: node scripts/restore.js backup.tar.gz   — REPLACES the database and media with the archive.
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const { restoreBackupArchive } = require('../src/services/backup');

(async () => {
  if (!process.argv[2]) throw new Error('usage: node scripts/restore.js <backup.tar.gz>');
  await mongoose.connect(process.env.MONGO_URI);
  const result = await restoreBackupArchive(path.resolve(process.argv[2]));
  console.log('restored:', result.restored, 'backup date:', result.createdAt);
  await mongoose.disconnect();
})().catch((err) => { console.error('restore failed:', err.message); process.exit(1); });
