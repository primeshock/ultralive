const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const mongoose = require('mongoose');

const { EJSON } = mongoose.mongo.BSON;
const MEDIA_DIR = path.join(process.cwd(), 'media');
const SKIP = new Set(['telemetrysnapshots']); // rebuilt automatically, not worth carrying over
const FORMAT = 1;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
  });
}

async function dumpCollection(db, name, file) {
  const out = fs.createWriteStream(file);
  let count = 0;
  for await (const doc of db.collection(name).find({})) {
    if (!out.write(`${EJSON.stringify(doc, { relaxed: false })}\n`)) await new Promise((r) => out.once('drain', r));
    count += 1;
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  return count;
}

// Writes a .tar.gz with every collection (EJSON lines) plus the uploaded media files.
async function createBackupArchive(targetFile) {
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'ul-backup-'));
  try {
    const db = mongoose.connection.db;
    await fsp.mkdir(path.join(work, 'db'));
    const collections = {};
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      if (name.startsWith('system.') || SKIP.has(name)) continue;
      collections[name] = await dumpCollection(db, name, path.join(work, 'db', `${name}.ndjson`));
    }
    if (fs.existsSync(MEDIA_DIR)) await fsp.cp(MEDIA_DIR, path.join(work, 'media'), { recursive: true });
    await fsp.writeFile(path.join(work, 'manifest.json'), JSON.stringify({ format: FORMAT, app: 'ultra-live', createdAt: new Date().toISOString(), database: db.databaseName, collections }, null, 2));
    await fsp.mkdir(path.dirname(targetFile), { recursive: true });
    await run('tar', ['-czf', targetFile, '-C', work, '.']);
    return { file: targetFile, collections };
  } finally {
    fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

async function assertSafeArchive(file) {
  const listing = (await run('tar', ['-tzf', file])).split('\n').filter(Boolean);
  for (const entry of listing) {
    if (entry.startsWith('/') || entry.split('/').includes('..')) throw Object.assign(new Error('فایل بکاپ نامعتبر یا ناامن است.'), { status: 400 });
  }
}

// Replaces ALL data with the archive's content (database + media). Used for server migration.
async function restoreBackupArchive(file) {
  await assertSafeArchive(file);
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'ul-restore-'));
  try {
    await run('tar', ['-xzf', file, '-C', work, '--no-same-owner']);
    const manifest = JSON.parse(await fsp.readFile(path.join(work, 'manifest.json'), 'utf8').catch(() => 'null'));
    if (!manifest || manifest.app !== 'ultra-live' || manifest.format > FORMAT) throw Object.assign(new Error('این فایل، بکاپ معتبر Ultra Live نیست.'), { status: 400 });
    const db = mongoose.connection.db;
    const restored = {};
    for (const name of Object.keys(manifest.collections)) {
      if (!/^[A-Za-z0-9_.-]+$/.test(name)) continue;
      const col = db.collection(name);
      await col.deleteMany({});
      let batch = [];
      let count = 0;
      const lines = fs.createReadStream(path.join(work, 'db', `${name}.ndjson`), 'utf8');
      let tail = '';
      for await (const chunk of lines) {
        const parts = (tail + chunk).split('\n');
        tail = parts.pop();
        for (const line of parts) if (line.trim()) batch.push(EJSON.parse(line, { relaxed: false }));
        if (batch.length >= 500) { await col.insertMany(batch, { ordered: false }); count += batch.length; batch = []; }
      }
      if (tail.trim()) batch.push(EJSON.parse(tail, { relaxed: false }));
      if (batch.length) { await col.insertMany(batch, { ordered: false }); count += batch.length; }
      restored[name] = count;
    }
    if (fs.existsSync(path.join(work, 'media'))) {
      await fsp.mkdir(MEDIA_DIR, { recursive: true });
      await fsp.cp(path.join(work, 'media'), MEDIA_DIR, { recursive: true, force: true });
    }
    return { restored, createdAt: manifest.createdAt };
  } finally {
    fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { createBackupArchive, restoreBackupArchive, spawn };
