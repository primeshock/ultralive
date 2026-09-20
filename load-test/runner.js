#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const execFileAsync = promisify(execFile);
let stopRequested = null;

const PROFILES = {
  smoke: { users: 5, duration: 60 },
  '10': { users: 10, duration: 120 },
  '25': { users: 25, duration: 120 },
  '50': { users: 50, duration: 180 },
  '100': { users: 100, duration: 180 },
  '200': { users: 200, duration: 180 },
  '300': { users: 300, duration: 180 },
  '500': { users: 500, duration: 180 },
  '600': { users: 600, duration: 180 },
};

const DEFAULTS = {
  baseUrl: 'http://127.0.0.1:5000',
  rampPerSecond: 2,
  maxCpuPercent: 85,
  maxMemoryPercent: 85,
  maxErrorRate: 0.10,
  maxReconnectRate: 0.10,
  maxEventLoopLagMs: 250,
  consecutiveBreaches: 3,
  pollMs: 5000,
  outputDir: path.join(__dirname, 'results'),
};

function help() {
  console.log(`Koosha Live controlled student load test\n\nUsage:\n  npm run loadtest -- --profile smoke [options]\n  npm run loadtest -- --profile 100 --allow-large --target-production\n\nOptions:\n  --profile <name>           smoke, 10, 25, 50, 100, 200, 300, 500, 600\n  --base-url <url>           Default: http://127.0.0.1:5000\n  --channel <username>       Teacher channel to join\n  --username <admin>         Owner/admin username for test-link creation\n  --password <password>      Owner/admin password (or KOOSHA_LOADTEST_PASSWORD)\n  --duration <seconds>       Override profile duration\n  --ramp-per-second <n>      Controlled connection ramp; default 2\n  --allow-large              Required for profiles above 100 users\n  --target-production        Required to use a non-local target\n  --list-profiles            Print profiles and exit\n  --help                     Show this help\n\nThreshold overrides:\n  --max-cpu <percent> --max-memory <percent> --max-error-rate <ratio>\n  --max-reconnect-rate <ratio> --max-event-loop-lag <ms>`);
}

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help') args.help = true;
    else if (flag === '--list-profiles') args.list = true;
    else if (flag === '--allow-large') args.allowLarge = true;
    else if (flag === '--target-production') args.targetProduction = true;
    else if (flag.startsWith('--')) {
      const key = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      args[key] = argv[index + 1]; index += 1;
    }
  }
  return args;
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cookieHeader(cookies) {
  return Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ');
}

function storeCookies(headers, cookies) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : (headers.get('set-cookie') || '').split(/,(?=[^;]+=[^;]+)/);
  for (const value of values) {
    const match = value.match(/^\s*([^=;]+)=([^;]*)/);
    if (match) cookies[match[1]] = match[2];
  }
}

async function request(baseUrl, pathname, options = {}, cookies = {}) {
  const headers = { ...(options.headers || {}) };
  const cookie = cookieHeader(cookies);
  if (cookie) headers.cookie = cookie;
  const response = await fetch(new URL(pathname, baseUrl), { ...options, headers, redirect: 'manual' });
  storeCookies(response.headers, cookies);
  return response;
}

async function jsonResponse(response) {
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 300) }; }
  if (!response.ok) throw new Error(`${response.status}: ${body.error || response.statusText}`);
  return body;
}

async function login(baseUrl, username, password) {
  const cookies = {};
  const response = await request(baseUrl, '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) }, cookies);
  await jsonResponse(response);
  return cookies;
}

function cookiesFromHeader(header) {
  return Object.fromEntries(String(header || '').split(';').map((part) => part.trim().split('='))
    .filter(([name, value]) => name && value !== undefined)
    .map(([name, ...value]) => [name, value.join('=')]));
}

async function createStudentCookies(baseUrl, adminCookies, channel, index) {
  const response = await request(baseUrl, `/api/admin/channels/${encodeURIComponent(channel)}/test-link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: `loadtest-${index}` }) }, adminCookies);
  const link = await jsonResponse(response);
  const cookies = {};
  const join = await request(baseUrl, new URL(link.url).pathname + new URL(link.url).search, {}, cookies);
  if (![301, 302, 303, 307, 308].includes(join.status)) throw new Error(`join failed with ${join.status}`);
  return cookies;
}

async function getCredentials(baseUrl, cookies, channel) {
  const started = performance.now();
  const response = await request(baseUrl, `/api/livekit/token?channel=${encodeURIComponent(channel)}`, {}, cookies);
  const body = await jsonResponse(response);
  return { ...body, latencyMs: Math.round(performance.now() - started) };
}

async function localProcessMetrics() {
  try {
    const [{ stdout: processOutput }, { stdout: pm2Output }] = await Promise.all([
      execFileAsync('ps', ['-e'], { timeout: 1000 }),
      execFileAsync('pm2', ['jlist'], { timeout: 1200 }),
    ]);
    const processes = JSON.parse(pm2Output || '[]');
    return {
      processCount: Math.max(0, processOutput.trim().split('\n').length - 1),
      pm2: processes.filter((item) => ['unlimited-stream-backend', 'unlimited-stream-frontend'].includes(item.name)).map((item) => ({ name: item.name, status: item.pm2_env?.status || 'unavailable', cpu: item.monit?.cpu ?? null, memoryBytes: item.monit?.memory ?? null })),
    };
  } catch {
    return { processCount: null, pm2: [] };
  }
}

function profileList() {
  for (const [name, profile] of Object.entries(PROFILES)) console.log(`${name.padEnd(6)} ${profile.users} users, ${profile.duration}s`);
}

function validate(args, profile) {
  if (!profile) throw new Error(`Unknown profile. Use --list-profiles.`);
  if (profile.users > 100 && !args.allowLarge) throw new Error('Profiles above 100 users require --allow-large.');
  const base = new URL(args.baseUrl);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(base.hostname);
  if (!isLocal && !args.targetProduction) throw new Error('Non-local targets require explicit --target-production.');
  if (number(args.rampPerSecond, 0) <= 0) throw new Error('--ramp-per-second must be greater than zero.');
  const hasAuthCookie = args.authCookie || process.env.KOOSHA_LOADTEST_AUTH_COOKIE;
  if (!args.channel || (!hasAuthCookie && (!args.username || !(args.password || process.env.KOOSHA_LOADTEST_PASSWORD)))) throw new Error('--channel and authentication credentials are required.');
}

async function writeStatus(outputDir, testId, status) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `${testId}.status.json`), JSON.stringify({ testId, updatedAt: new Date().toISOString(), ...status }, null, 2));
}

async function loadRtc() {
  try { return require('@livekit/rtc-node'); } catch (error) { throw new Error(`Install load-test dependencies first: cd load-test && npm install (${error.message})`); }
}

function disconnectClient(client) {
  return client?.room?.disconnect?.().catch?.(() => {}) || Promise.resolve();
}

async function run(args) {
  const profile = PROFILES[String(args.profile)];
  validate(args, profile);
  const targetUsers = profile.users;
  const durationSeconds = Math.max(1, Math.floor(number(args.duration, profile.duration)));
  const thresholds = {
    maxCpuPercent: number(args.maxCpu, DEFAULTS.maxCpuPercent),
    maxMemoryPercent: number(args.maxMemory, DEFAULTS.maxMemoryPercent),
    maxErrorRate: number(args.maxErrorRate, DEFAULTS.maxErrorRate),
    maxReconnectRate: number(args.maxReconnectRate, DEFAULTS.maxReconnectRate),
    maxEventLoopLagMs: number(args.maxEventLoopLag, DEFAULTS.maxEventLoopLagMs),
  };
  const testId = args.testId || `loadtest-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${args.profile}`;
  const startedAt = new Date();
  const adminCookies = (args.authCookie || process.env.KOOSHA_LOADTEST_AUTH_COOKIE)
    ? cookiesFromHeader(args.authCookie || process.env.KOOSHA_LOADTEST_AUTH_COOKIE)
    : await login(args.baseUrl, args.username, args.password || process.env.KOOSHA_LOADTEST_PASSWORD);
  const rtc = await loadRtc();
  const clients = new Map();
  const errors = [];
  const connectLatencies = [];
  const tokenLatencies = [];
  let failedConnections = 0; let reconnects = 0; let subscriptions = 0; let subscriptionFailures = 0;
  let disconnected = 0; let aborted = false; let abortReason = null; let breaches = 0;
  let latestTelemetry = null; const infrastructure = [];
  const loopLag = monitorEventLoopDelay({ resolution: 20 }); loopLag.enable();
  const startedMs = performance.now();

  function currentErrorRate() { return (failedConnections + subscriptionFailures) / Math.max(1, clients.size); }
  function currentReconnectRate() { return reconnects / Math.max(1, clients.size); }
  function abort(reason) { if (!aborted) { aborted = true; abortReason = reason; console.error(`\nABORT: ${reason}`); } }
  stopRequested = () => abort('تست توسط مالک متوقف شد.');
  await writeStatus(args.outputDir, testId, { profile: String(args.profile), targetUsers, durationSeconds, status: 'starting', connected: 0, failed: 0, elapsedSeconds: 0, aborted: false });

  async function collectTelemetry() {
    try {
      const response = await request(args.baseUrl, '/api/master/telemetry?limit=1', {}, adminCookies);
      const body = await jsonResponse(response); latestTelemetry = body.latest || body.current;
      if (latestTelemetry) infrastructure.push({ capturedAt: latestTelemetry.capturedAt, loadAverage: os.loadavg(), ...(await localProcessMetrics()), ...latestTelemetry });
      const cpu = latestTelemetry?.cpu; const memory = latestTelemetry?.ramTotal ? (latestTelemetry.ramUsed / latestTelemetry.ramTotal) * 100 : null;
      const lag = loopLag.mean / 1e6;
      if (cpu >= thresholds.maxCpuPercent) breaches += 1; else if (memory >= thresholds.maxMemoryPercent) breaches += 1; else if (currentErrorRate() >= thresholds.maxErrorRate) breaches += 1; else if (currentReconnectRate() >= thresholds.maxReconnectRate) breaches += 1; else if (lag >= thresholds.maxEventLoopLagMs) breaches += 1; else breaches = 0;
      if (breaches >= DEFAULTS.consecutiveBreaches) abort(`safety threshold exceeded (cpu=${cpu ?? '-'}%, memory=${memory?.toFixed(1) ?? '-'}%, errors=${currentErrorRate().toFixed(3)}, reconnects=${currentReconnectRate().toFixed(3)}, eventLoop=${lag.toFixed(1)}ms)`);
      await writeStatus(args.outputDir, testId, { profile: String(args.profile), targetUsers, durationSeconds, status: aborted ? 'aborted' : 'running', connected: [...clients.values()].filter((client) => client.state === 'connected').length, failed: failedConnections, reconnects, elapsedSeconds: Math.round((performance.now() - startedMs) / 1000), latestTelemetry, infrastructureSamples: infrastructure, aborted, abortReason });
    } catch (error) { errors.push(`telemetry: ${error.message}`); }
  }

  async function addClient(index) {
    if (aborted) return;
    const client = { index, room: null, state: 'starting', connectedAt: null, subscriptions: 0 };
    clients.set(index, client);
    try {
      const cookies = await createStudentCookies(args.baseUrl, adminCookies, args.channel, index);
      const credentials = await getCredentials(args.baseUrl, cookies, args.channel); tokenLatencies.push(credentials.latencyMs);
      const room = new rtc.Room(); client.room = room;
      room.on(rtc.RoomEvent.TrackSubscribed, () => { subscriptions += 1; client.subscriptions += 1; });
      room.on(rtc.RoomEvent.TrackSubscriptionFailed, () => { subscriptionFailures += 1; });
      room.on(rtc.RoomEvent.Reconnecting, () => { reconnects += 1; });
      room.on(rtc.RoomEvent.Disconnected, () => { disconnected += 1; });
      const connectedStart = performance.now();
      await room.connect(credentials.serverUrl, credentials.participantToken, { autoSubscribe: true });
      client.connectedAt = new Date(); client.state = 'connected'; connectLatencies.push(Math.round(performance.now() - connectedStart));
    } catch (error) {
      client.state = 'failed'; failedConnections += 1; errors.push(`user-${index}: ${error.message}`);
    }
  }

  console.log(`Starting ${testId}: ${targetUsers} student subscribers for ${durationSeconds}s at ${args.baseUrl}`);
  const telemetryTimer = setInterval(() => void collectTelemetry(), DEFAULTS.pollMs);
  for (let index = 1; index <= targetUsers && !aborted; index += 1) {
    await addClient(index);
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.round(1000 / number(args.rampPerSecond, DEFAULTS.rampPerSecond)))));
  }
  await collectTelemetry();
  while (!aborted && performance.now() - startedMs < durationSeconds * 1000) await new Promise((resolve) => setTimeout(resolve, Math.min(1000, Math.max(100, durationSeconds * 1000 - (performance.now() - startedMs)))));
  clearInterval(telemetryTimer); await collectTelemetry();
  await Promise.all([...clients.values()].map((client) => disconnectClient(client)));
  loopLag.disable();

  const connected = [...clients.values()].filter((client) => client.state === 'connected').length;
  const peak = (field, transform = (value) => value) => Math.max(...infrastructure.map((item) => Number(transform(item[field], item)) || 0), 0);
  const peakMemory = peak('ramTotal', (total, item) => item.ramUsed && total ? (item.ramUsed / total) * 100 : 0);
  const result = {
    testId, profile: String(args.profile), targetUsers, durationSeconds, startedAt: startedAt.toISOString(), endedAt: new Date().toISOString(),
    successfulConnections: connected, failedConnections, reconnects, disconnectCount: disconnected,
    tokenRequests: tokenLatencies.length, averageTokenLatencyMs: average(tokenLatencies), averageConnectLatencyMs: average(connectLatencies), p95ConnectLatencyMs: percentile(connectLatencies, 0.95),
    subscriptions, subscriptionFailures, errorCount: errors.length, errorRate: (failedConnections + subscriptionFailures) / Math.max(1, targetUsers), reconnectRate: reconnects / Math.max(1, connected),
    peakCpuPercent: peak('cpu'), peakMemoryPercent: peakMemory, peakNetworkRxBytesPerSecond: peak('networkRx'), peakNetworkTxBytesPerSecond: peak('networkTx'),
    peakRooms: peak('activeRooms'), peakParticipants: peak('activeParticipants'), peakPublishers: peak('activePublishers'), eventLoopLagMeanMs: loopLag.mean / 1e6,
    peakLoadAverage: peak('loadAverage', (value) => Array.isArray(value) ? value[0] : 0), peakProcessCount: peak('processCount'),
    pm2Samples: infrastructure.flatMap((item) => item.pm2 || []),
    mongoStatus: latestTelemetry?.services?.mongodb || 'unavailable', redisStatus: latestTelemetry?.services?.redis || 'unavailable', livekitStatus: latestTelemetry?.services?.livekit || 'unavailable',
    thresholds, aborted, abortReason, errors: errors.slice(0, 50), infrastructureSamples: infrastructure,
  };
  await fs.mkdir(args.outputDir, { recursive: true });
  const resultPath = path.join(args.outputDir, `${testId}.json`); await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
  await writeStatus(args.outputDir, testId, { profile: String(args.profile), targetUsers, durationSeconds, status: aborted ? 'aborted' : 'completed', connected, failed: failedConnections, reconnects, elapsedSeconds: Math.round((performance.now() - startedMs) / 1000), latestTelemetry, aborted, abortReason, resultPath });
  stopRequested = null;
  printReport(result, resultPath);
  return result;
}

function average(values) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null; }
function percentile(values, ratio) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]; }
function printReport(result, resultPath) {
  console.log(`\nKoosha Live Load Test\n---------------------\nProfile: ${result.targetUsers} students\nDuration: ${result.durationSeconds}s\n\nConnections\n  Target:       ${result.targetUsers}\n  Connected:    ${result.successfulConnections}\n  Failed:       ${result.failedConnections}\n  Reconnects:   ${result.reconnects}\n\nLatency\n  Avg connect:  ${result.averageConnectLatencyMs ?? '-'} ms\n  P95 connect:  ${result.p95ConnectLatencyMs ?? '-'} ms\n\nErrors\n  Error rate:   ${(result.errorRate * 100).toFixed(2)}%\n\nInfrastructure\n  Peak CPU:     ${result.peakCpuPercent.toFixed(1)}%\n  Peak RAM:     ${result.peakMemoryPercent.toFixed(1)}%\n  Peak RX:      ${result.peakNetworkRxBytesPerSecond} B/s\n  Peak TX:      ${result.peakNetworkTxBytesPerSecond} B/s\n\nLiveKit\n  Peak rooms:   ${result.peakRooms}\n  Peak users:   ${result.peakParticipants}\n\nResult\n  Completed:    ${result.aborted ? 'NO' : 'YES'}\n  Aborted:      ${result.aborted ? 'YES: ' + result.abortReason : 'NO'}\n  JSON:         ${resultPath}`);
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return help();
  if (args.list) return profileList();
  if (!args.profile) throw new Error('--profile is required. Use --help.');
  await run(args);
})().catch((error) => { console.error(`Load test refused: ${error.message}`); process.exitCode = 1; });

process.on('SIGTERM', () => { if (stopRequested) stopRequested(); });
process.on('SIGINT', () => { if (stopRequested) stopRequested(); });
