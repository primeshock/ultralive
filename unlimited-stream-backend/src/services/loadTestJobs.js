const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const User = require('../models/User');
const { getChannelTelemetry } = require('./livekit');
const { publicBaseUrl, port } = require('../config/env');

const PROFILES = Object.freeze({
  smoke: { users: 5, duration: 60 },
  '10': { users: 10, duration: 120 },
  '25': { users: 25, duration: 120 },
  '50': { users: 50, duration: 180 },
  '100': { users: 100, duration: 180 },
  '200': { users: 200, duration: 180 },
  '300': { users: 300, duration: 180 },
  '500': { users: 500, duration: 180 },
  '600': { users: 600, duration: 180 },
});
const RESULTS_DIR = path.resolve(__dirname, '../../../load-test/results');
const RUNNER_PATH = path.resolve(__dirname, '../../../load-test/runner.js');
const jobs = new Map();

function safeId(value) {
  return /^[a-z0-9-]{8,80}$/i.test(String(value || ''));
}

function resultPath(testId) { return path.join(RESULTS_DIR, `${testId}.json`); }
function statusPath(testId) { return path.join(RESULTS_DIR, `${testId}.status.json`); }

async function readJson(file, testId) {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    return value && value.testId === testId ? value : null;
  } catch {
    return null;
  }
}

async function listResults() {
  const entries = await fs.readdir(RESULTS_DIR, { withFileTypes: true }).catch(() => []);
  const results = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^loadtest-[a-z0-9-]+\.json$/i.test(entry.name) || entry.name.endsWith('.status.json')) continue;
    const testId = entry.name.slice(0, -5);
    const result = await readJson(resultPath(testId), testId);
    if (result) results.push(result);
  }
  return results.sort((left, right) => new Date(right.endedAt || right.startedAt || 0) - new Date(left.endedAt || left.startedAt || 0));
}

async function getJob(testId) {
  if (!safeId(testId)) return null;
  const live = jobs.get(testId);
  const status = await readJson(statusPath(testId), testId);
  const result = await readJson(resultPath(testId), testId);
  if (!live && !status && !result) return null;
  return { ...(status || {}), ...(result ? { status: result.aborted ? 'aborted' : 'completed', result } : {}), running: Boolean(live && !live.closed), pid: live?.process.pid || null };
}

async function startJob({ profile, channel, duration, rampPerSecond, authCookie, allowLarge }) {
  const selected = PROFILES[String(profile)];
  if (!selected) throw Object.assign(new Error('پروفایل تست نامعتبر است.'), { status: 400 });
  if (!/^[a-z0-9_]{3,24}$/i.test(String(channel || ''))) throw Object.assign(new Error('کانال کلاس نامعتبر است.'), { status: 400 });
  if (jobs.size) throw Object.assign(new Error('یک تست ظرفیت در حال اجراست.'), { status: 409 });

  const teacher = await User.findOne({ username: String(channel).toLowerCase(), role: 'teacher' }).select('username');
  if (!teacher) throw Object.assign(new Error('کلاس پیدا نشد.'), { status: 404 });
  let media;
  try { media = await getChannelTelemetry(teacher.username); } catch { throw Object.assign(new Error('وضعیت LiveKit این کلاس قابل بررسی نیست.'), { status: 503 }); }
  if (media.status !== 'online' || media.publishers < 1) throw Object.assign(new Error('پخش زنده این کلاس فعال نیست. ابتدا پخش مدرس را فعال کنید.'), { status: 409 });

  const safeDuration = duration === undefined ? selected.duration : Number(duration);
  const safeRamp = rampPerSecond === undefined ? 2 : Number(rampPerSecond);
  if (!Number.isInteger(safeDuration) || safeDuration < 30 || safeDuration > 600) throw Object.assign(new Error('مدت تست باید بین ۳۰ تا ۶۰۰ ثانیه باشد.'), { status: 400 });
  if (!Number.isFinite(safeRamp) || safeRamp < 0.2 || safeRamp > 10) throw Object.assign(new Error('سرعت ramp باید بین ۰.۲ تا ۱۰ کاربر در ثانیه باشد.'), { status: 400 });
  if (selected.users >= 100 && !allowLarge) throw Object.assign(new Error('برای تست‌های ۱۰۰ کاربر یا بیشتر تأیید بزرگ لازم است.'), { status: 400 });

  const testId = `loadtest-${Date.now()}-${String(profile).toLowerCase()}`;
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const baseUrl = publicBaseUrl || `http://127.0.0.1:${port}`;
  const args = ['--profile', String(profile), '--channel', teacher.username, '--base-url', baseUrl, '--test-id', testId, '--output-dir', RESULTS_DIR, '--duration', String(safeDuration), '--ramp-per-second', String(safeRamp)];
  if (selected.users >= 100) args.push('--allow-large');
  if (!['localhost', '127.0.0.1', '::1'].includes(new URL(baseUrl).hostname)) args.push('--target-production');
  const child = spawn(process.execPath, [RUNNER_PATH, ...args], { cwd: path.resolve(__dirname, '../../../load-test'), env: { ...process.env, KOOSHA_LOADTEST_AUTH_COOKIE: authCookie || '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const job = { process: child, closed: false, output: [], errorOutput: [] };
  jobs.set(testId, job);
  child.stdout.on('data', (chunk) => { job.output.push(String(chunk).slice(-2000)); });
  child.stderr.on('data', (chunk) => { job.errorOutput.push(String(chunk).slice(-2000)); });
  child.on('close', async (code, signal) => {
    job.closed = true;
    if (!await readJson(resultPath(testId), testId)) await fs.writeFile(statusPath(testId), JSON.stringify({ testId, status: 'failed', aborted: true, abortReason: signal || `runner exited with code ${code}`, error: job.errorOutput.slice(-5).join('') }, null, 2));
    jobs.delete(testId);
  });
  return { testId, profile: String(profile), targetUsers: selected.users, durationSeconds: safeDuration, status: 'starting' };
}

async function stopJob(testId) {
  const job = jobs.get(testId);
  if (!job || job.closed) throw Object.assign(new Error('تست فعالی با این شناسه وجود ندارد.'), { status: 404 });
  job.process.kill('SIGTERM');
  return { testId, status: 'stopping' };
}

module.exports = { PROFILES, listResults, getJob, startJob, stopJob };
