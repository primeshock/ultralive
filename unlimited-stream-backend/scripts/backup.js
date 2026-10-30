// Usage: node scripts/backup.js [output.tar.gz]   (used by update.sh before every update)
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const { createBackupArchive } = require('../src/services/backup');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const target = path.resolve(process.argv[2] || `backups/ultralive-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`);
  const { collections } = await createBackupArchive(target);
  console.log(`backup written: ${target} (${Object.keys(collections).length} collections)`);
  await mongoose.disconnect();
})().catch((err) => { console.error('backup failed:', err.message); process.exit(1); });
