const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const { execFile, spawn } = require('child_process');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const { createBackupArchive, restoreBackupArchive } = require('../services/backup');

const router = express.Router();
router.use(requireAuth, requireRole('SUPER_OWNER', 'owner'));

const APP_DIR = path.resolve(__dirname, '../../..');
const STATUS_FILE = path.join(APP_DIR, '.update-status.json');
const LOG_FILE = path.join(APP_DIR, '.update.log');
const git = (args, timeout = 20000) => new Promise((resolve, reject) => execFile('git', args, { cwd: APP_DIR, timeout }, (err, out) => (err ? reject(err) : resolve(String(out).trim()))));
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 4 * 1024 * 1024 * 1024, files: 1 } });

// ---- backup / restore ----
router.get('/backup', async (_req, res) => {
  const file = path.join(os.tmpdir(), `ultralive-${Date.now()}.tar.gz`);
  await createBackupArchive(file);
  const name = `ultralive-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.tar.gz`;
  res.download(file, name, () => fs.promises.unlink(file).catch(() => {}));
});

router.post('/restore', upload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'فایل بکاپ ارسال نشده است.' });
  if (req.body?.confirm !== 'RESTORE') {
    fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: 'برای تأیید باید عبارت RESTORE ارسال شود.' });
  }
  try {
    res.json({ ok: true, ...(await restoreBackupArchive(req.file.path)), note: 'همهٔ نشست‌ها با اطلاعات سرور قبلی جایگزین شد؛ دوباره وارد شوید.' });
  } finally {
    fs.promises.unlink(req.file.path).catch(() => {});
  }
});

// ---- panel update ----
async function readStatus() {
  try { return JSON.parse(await fs.promises.readFile(STATUS_FILE, 'utf8')); } catch { return { state: 'idle' }; }
}

router.get('/version', async (_req, res) => {
  if (!fs.existsSync(path.join(APP_DIR, '.git'))) return res.json({ available: false, reason: 'نصب بدون git است.' });
  try {
    const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const current = await git(['rev-parse', '--short', 'HEAD']);
    await git(['fetch', '--quiet', 'origin', branch], 40000).catch(() => {});
    const behind = Number(await git(['rev-list', '--count', `HEAD..origin/${branch}`]).catch(() => '0'));
    const latest = await git(['rev-parse', '--short', `origin/${branch}`]).catch(() => current);
    const changes = behind ? (await git(['log', '--pretty=%s', '-n', '15', `HEAD..origin/${branch}`]).catch(() => '')).split('\n').filter(Boolean) : [];
    res.json({ available: true, branch, current, latest, behind, changes, status: await readStatus(), enabled: process.env.ALLOW_PANEL_UPDATE === 'true' });
  } catch (err) {
    res.json({ available: false, reason: err.message });
  }
});

router.post('/update', async (_req, res) => {
  if (process.env.ALLOW_PANEL_UPDATE !== 'true') return res.status(403).json({ error: 'به‌روزرسانی از پنل روی این نصب فعال نیست.' });
  const status = await readStatus();
  if (status.state === 'running') return res.status(409).json({ error: 'به‌روزرسانی در حال اجراست.' });
  const script = path.join(APP_DIR, 'update.sh');
  if (!fs.existsSync(script)) return res.status(500).json({ error: 'update.sh پیدا نشد.' });
  fs.writeFileSync(STATUS_FILE, JSON.stringify({ state: 'running', startedAt: new Date().toISOString() }));
  const log = fs.openSync(LOG_FILE, 'w');
  // setsid: the script must survive the backend being restarted by pm2 halfway through.
  const child = spawn('setsid', ['bash', script, '--from-panel'], { cwd: APP_DIR, detached: true, stdio: ['ignore', log, log], env: process.env });
  child.on('error', () => fs.writeFileSync(STATUS_FILE, JSON.stringify({ state: 'failed', error: 'اجرای update.sh ممکن نشد.' })));
  child.unref();
  res.status(202).json({ ok: true });
});

router.get('/update/status', async (_req, res) => {
  const status = await readStatus();
  const log = await fs.promises.readFile(LOG_FILE, 'utf8').catch(() => '');
  res.json({ ...status, log: log.split('\n').slice(-40).join('\n') });
});

module.exports = router;
