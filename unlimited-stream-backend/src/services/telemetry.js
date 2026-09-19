const fs = require('fs/promises');
const net = require('net');
const os = require('os');
const { execFile } = require('child_process');
const mongoose = require('mongoose');
const TelemetrySnapshot = require('../models/TelemetrySnapshot');
const { livekitEnabled } = require('../config/env');
const { getRoomTelemetry } = require('./livekit');

const SAMPLE_INTERVAL_MS = 5000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

let timer = null;
let collecting = false;
let previousCpu = null;
let previousNetwork = null;
let cleanupCounter = 0;

function cpuTotals() {
  return os.cpus().reduce((total, cpu) => {
    const values = Object.values(cpu.times);
    return { total: total.total + values.reduce((sum, value) => sum + value, 0), idle: total.idle + cpu.times.idle };
  }, { total: 0, idle: 0 });
}

async function networkTotals() {
  try {
    const content = await fs.readFile('/proc/net/dev', 'utf8');
    return content.split('\n').slice(2).reduce((total, line) => {
      const match = line.match(/^\s*([^:]+):\s*(.+)$/);
      if (!match || match[1].trim() === 'lo') return total;
      const fields = match[2].trim().split(/\s+/).map(Number);
      return { rx: total.rx + (fields[0] || 0), tx: total.tx + (fields[8] || 0) };
    }, { rx: 0, tx: 0 });
  } catch {
    return null;
  }
}

function command(commandName, args) {
  return new Promise((resolve) => {
    execFile(commandName, args, { timeout: 1200 }, (error, stdout) => resolve(error ? '' : String(stdout).trim()));
  });
}

async function pm2Services() {
  try {
    const output = await command('pm2', ['jlist']);
    const processes = JSON.parse(output || '[]');
    const statusOf = (name) => processes.find((process) => process.name === name)?.pm2_env?.status || 'unavailable';
    return { backend: statusOf('unlimited-stream-backend'), frontend: statusOf('unlimited-stream-frontend') };
  } catch {
    return { backend: 'unavailable', frontend: 'unavailable' };
  }
}

function redisStatus() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 6379 });
    let settled = false;
    const finish = (status) => { if (settled) return; settled = true; socket.destroy(); resolve(status); };
    socket.setTimeout(600, () => finish('offline'));
    socket.on('connect', () => socket.write('*1\r\n$4\r\nPING\r\n'));
    socket.on('data', (data) => finish(String(data).includes('PONG') ? 'online' : 'unhealthy'));
    socket.on('error', () => finish('offline'));
  });
}

async function nginxStatus() {
  const status = await command('systemctl', ['is-active', 'nginx']);
  return status || 'unavailable';
}

function cpuUsage() {
  const current = cpuTotals();
  const value = previousCpu && current.total > previousCpu.total
    ? ((current.total - previousCpu.total - (current.idle - previousCpu.idle)) / (current.total - previousCpu.total)) * 100
    : null;
  previousCpu = current;
  return value === null ? null : Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

function networkRates(current) {
  if (!current || !previousNetwork) {
    previousNetwork = current;
    return { rx: null, tx: null };
  }
  const seconds = SAMPLE_INTERVAL_MS / 1000;
  const rates = { rx: Math.max(0, (current.rx - previousNetwork.rx) / seconds), tx: Math.max(0, (current.tx - previousNetwork.tx) / seconds) };
  previousNetwork = current;
  return rates;
}

async function collectSnapshot() {
  const [network, services, redis, nginx, rooms] = await Promise.all([
    networkTotals(),
    pm2Services(),
    redisStatus(),
    nginxStatus(),
    livekitEnabled ? getRoomTelemetry().catch(() => ({ status: 'unavailable', rooms: 0, participants: 0, publishers: 0 })) : Promise.resolve({ status: 'disabled', rooms: 0, participants: 0, publishers: 0 }),
  ]);
  const memory = { total: Math.round(os.totalmem() / 1024 / 1024), free: Math.round(os.freemem() / 1024 / 1024) };
  const rates = networkRates(network);
  const snapshot = {
    capturedAt: new Date(),
    serverUptimeSeconds: os.uptime(),
    cpu: cpuUsage(),
    ramUsed: memory.total - memory.free,
    ramTotal: memory.total,
    networkRx: rates.rx,
    networkTx: rates.tx,
    activeRooms: rooms.rooms,
    activeParticipants: rooms.participants,
    activePublishers: rooms.publishers,
    services: {
      backend: services.backend,
      frontend: services.frontend,
      mongodb: mongoose.connection.readyState === 1 ? 'online' : 'offline',
      redis,
      livekit: rooms.status,
      nginx,
    },
  };
  await TelemetrySnapshot.create(snapshot);
  cleanupCounter += 1;
  if (cleanupCounter >= 60) {
    cleanupCounter = 0;
    await TelemetrySnapshot.deleteMany({ capturedAt: { $lt: new Date(Date.now() - RETENTION_MS) } });
  }
  return snapshot;
}

async function telemetryHistory(limit = 360) {
  const snapshots = await TelemetrySnapshot.find().sort({ capturedAt: -1 }).limit(Math.min(Number(limit) || 360, 360)).lean();
  return snapshots.reverse();
}

function startTelemetryCollector() {
  if (timer) return;
  const tick = async () => {
    if (collecting) return;
    collecting = true;
    try { await collectSnapshot(); } catch (error) { console.error('[telemetry]', error.message); } finally { collecting = false; }
  };
  void tick();
  timer = setInterval(tick, SAMPLE_INTERVAL_MS);
}

module.exports = { collectSnapshot, telemetryHistory, startTelemetryCollector };
