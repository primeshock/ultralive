const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const mongoose = require('mongoose');
const { TrackSource, DataPacket_Kind } = require('livekit-server-sdk');
const { COOKIE_NAME, verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const ClassFile = require('../models/ClassFile');
const ClassBoard = require('../models/ClassBoard');
const Class = require('../models/Class');
const LiveSession = require('../models/LiveSession');
const { canAccessClass } = require('../utils/classAccess');
const { loadOrganizationContext } = require('../utils/organizationScope');
const { findStreamTarget, canManageStreamTarget, isClassTarget } = require('../utils/streamTarget');
const { roomService, roomName } = require('../services/livekit');
const { corsOrigin } = require('../config/env');

const router = express.Router();
const FILES_ROOT = path.join(process.cwd(), 'media', 'class-files');
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const INLINE_MIME = /^(application\/pdf|image\/(png|jpe?g|gif|webp|avif)|video\/(mp4|webm|ogg)|audio\/(mpeg|mp3|ogg|wav|webm|aac|mp4|x-m4a))$/;
const ALLOWED_MIME = /^(application\/pdf|image\/|video\/|audio\/|application\/vnd\.(ms-|openxmlformats)|application\/(msword|zip)|text\/plain)/;
const SOURCE = {
  microphone: TrackSource.MICROPHONE,
  camera: TrackSource.CAMERA,
  screen: TrackSource.SCREEN_SHARE,
  screen_audio: TrackSource.SCREEN_SHARE_AUDIO,
};

// ---- shared helpers ------------------------------------------------------
async function loadTarget(req, res, next) {
  const channel = String(req.params.channel || '').toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(channel)) return res.status(400).json({ error: 'کلاس نامعتبر است.' });
  const target = await findStreamTarget(channel);
  if (!target) return res.status(404).json({ error: 'کلاس پیدا نشد.' });
  req.channel = channel;
  req.target = target;
  req.isStaff = false;
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      const user = await User.findById(verifyToken(token).sub);
      if (user && user.status !== 'DISABLED') {
        req.user = user;
        await new Promise((resolve, reject) => loadOrganizationContext(req, res, (e) => (e ? reject(e) : resolve())));
        req.isStaff = isClassTarget(target) ? canManageStreamTarget(req, target) : false;
      }
    }
  } catch { /* not a staff login */ }
  next();
}

const requireViewer = async (req, res, next) => {
  if (req.isStaff || (await canAccessClass(req.channel, req.cookies || {}))) return next();
  res.status(401).json({ error: 'دسترسی ندارید.' });
};
const requireStaff = (req, res, next) => (req.isStaff ? next() : res.status(403).json({ error: 'فقط مدیر کلاس مجاز است.' }));
const requireClass = (req, res, next) => (isClassTarget(req.target) ? next() : res.status(400).json({ error: 'این قابلیت فقط برای کلاس‌ها فعال است.' }));

async function broadcast(channel, message, identities) {
  const payload = new TextEncoder().encode(JSON.stringify(message));
  await roomService().sendData(roomName(channel), payload, DataPacket_Kind.RELIABLE, {
    topic: 'class',
    destinationIdentities: identities || [],
  }).catch((err) => console.warn('[meeting] sendData failed:', err.message));
}

function fileView(channel, file) {
  return { id: file._id, name: file.name, mime: file.mime, size: file.size, url: `/api/meeting/${channel}/files/${file._id}`, inline: INLINE_MIME.test(file.mime), createdAt: file.createdAt };
}

function meetingSettings(target) {
  const s = target.settings || {};
  return {
    showParticipantsToStudents: s.showParticipantsToStudents !== false,
    studentsMayRaiseHand: s.studentsMayRaiseHand !== false,
    stage: { content: s.stage?.content || null, boardOpen: Boolean(s.stage?.boardOpen), page: s.stage?.page || 1, boardPage: s.stage?.boardPage || 1 },
  };
}

// ---- state & settings ----------------------------------------------------
router.get('/:channel/state', loadTarget, requireViewer, async (req, res) => {
  const files = isClassTarget(req.target) ? await ClassFile.find({ classSlug: req.channel }).sort({ createdAt: -1 }).limit(200) : [];
  res.json({ mode: req.target.mode || 'studio', isStaff: req.isStaff, settings: meetingSettings(req.target), endsAt: endTimers.get(req.channel)?.endsAt || null, files: files.map((f) => fileView(req.channel, f)) });
});

router.post('/:channel/settings', loadTarget, requireStaff, requireClass, async (req, res) => {
  const body = req.body || {};
  const settings = { ...(req.target.settings || {}) };
  for (const key of ['showParticipantsToStudents', 'studentsMayRaiseHand']) {
    if (typeof body[key] === 'boolean') settings[key] = body[key];
  }
  req.target.settings = settings;
  req.target.markModified('settings');
  await req.target.save();
  const view = meetingSettings(req.target);
  await broadcast(req.channel, { type: 'settings', settings: view });
  res.json(view);
});

// Same class link, different format per session: studio (OBS) <-> desktop (interactive room).
router.post('/:channel/mode', loadTarget, requireStaff, requireClass, async (req, res) => {
  const mode = req.body?.mode;
  if (!['studio', 'desktop'].includes(mode)) return res.status(400).json({ error: 'حالت نامعتبر است.' });
  req.target.mode = mode;
  await req.target.save();
  await broadcast(req.channel, { type: 'mode', mode });
  res.json({ mode });
});

router.post('/:channel/stage', loadTarget, requireStaff, requireClass, async (req, res) => {
  const body = req.body || {};
  const current = req.target.settings?.stage || {};
  const stage = { content: current.content || null, boardOpen: Boolean(current.boardOpen), page: current.page || 1, boardPage: current.boardPage || 1 };
  if ('fileId' in body) {
    if (body.fileId) {
      if (!mongoose.isValidObjectId(body.fileId)) return res.status(400).json({ error: 'فایل نامعتبر است.' });
      const file = await ClassFile.findOne({ _id: body.fileId, classSlug: req.channel });
      if (!file) return res.status(404).json({ error: 'فایل پیدا نشد.' });
      stage.content = fileView(req.channel, file);
      stage.page = 1;
    } else {
      stage.content = null;
    }
  }
  if (typeof body.boardOpen === 'boolean') stage.boardOpen = body.boardOpen;
  if (Number.isInteger(body.page) && body.page >= 1 && body.page <= 5000) stage.page = body.page;
  if (Number.isInteger(body.boardPage) && body.boardPage >= 1 && body.boardPage <= 200) stage.boardPage = body.boardPage;
  req.target.settings = { ...(req.target.settings || {}), stage };
  req.target.markModified('settings');
  await req.target.save();
  await broadcast(req.channel, { type: 'stage', stage });
  res.json({ stage });
});

// ---- whiteboard / PDF annotation storage ----
const boardKeyOk = (key) => typeof key === 'string' && /^(board:\d{1,3}|file:[a-f0-9]{24}:\d{1,4})$/.test(key);

router.get('/:channel/board', loadTarget, requireViewer, async (req, res) => {
  if (!boardKeyOk(req.query.key)) return res.status(400).json({ error: 'کلید نامعتبر است.' });
  const doc = await ClassBoard.findOne({ classSlug: req.channel, key: req.query.key }).lean();
  res.json({ strokes: doc?.strokes || [] });
});

router.put('/:channel/board', loadTarget, requireStaff, requireClass, async (req, res) => {
  const { key, strokes } = req.body || {};
  if (!boardKeyOk(key) || !Array.isArray(strokes) || strokes.length > 4000) return res.status(400).json({ error: 'داده نامعتبر است.' });
  await ClassBoard.updateOne({ classSlug: req.channel, key }, { $set: { strokes } }, { upsert: true });
  res.json({ ok: true });
});

// ---- ending the class (immediately or after a countdown) ----
const endTimers = new Map();
async function finishClass(channel, target) {
  endTimers.delete(channel);
  await broadcast(channel, { type: 'ended' });
  await roomService().deleteRoom(roomName(channel)).catch(() => {});
  try {
    const classDoc = await Class.findOne({ slug: channel });
    if (classDoc) await LiveSession.updateMany({ classId: classDoc._id, status: 'live' }, { status: 'ended', endedAt: new Date() });
    if (target?.isLive) { target.isLive = false; await target.save(); }
  } catch (err) { console.warn('[meeting] end bookkeeping failed:', err.message); }
}

router.post('/:channel/end', loadTarget, requireStaff, requireClass, async (req, res) => {
  const minutes = Number(req.body?.afterMinutes || 0);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 240) return res.status(400).json({ error: 'زمان نامعتبر است.' });
  clearTimeout(endTimers.get(req.channel)?.timer);
  if (minutes === 0) { await finishClass(req.channel, req.target); return res.json({ ended: true }); }
  const endsAt = Date.now() + minutes * 60_000;
  const channel = req.channel;
  endTimers.set(channel, { endsAt, timer: setTimeout(() => finishClass(channel, null), minutes * 60_000) });
  await broadcast(channel, { type: 'ending', endsAt });
  res.json({ ended: false, endsAt });
});

router.delete('/:channel/end', loadTarget, requireStaff, async (req, res) => {
  clearTimeout(endTimers.get(req.channel)?.timer);
  endTimers.delete(req.channel);
  await broadcast(req.channel, { type: 'ending', endsAt: null });
  res.status(204).end();
});

// ---- files ---------------------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(FILES_ROOT, req.channel);
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename: (_req, _file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => (ALLOWED_MIME.test(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error('نوع فایل مجاز نیست.'), { status: 400 }))),
});

router.post('/:channel/files', loadTarget, requireStaff, requireClass, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'فایل ارسال نشده است.' });
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200);
  const doc = await ClassFile.create({
    classSlug: req.channel, organizationId: req.target.organizationId || null, name,
    mime: req.file.mimetype, size: req.file.size, storedName: req.file.filename, uploadedBy: String(req.user._id),
  });
  res.status(201).json(fileView(req.channel, doc));
});

router.get('/:channel/files/:fileId', loadTarget, requireViewer, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.fileId)) return res.status(404).end();
  const file = await ClassFile.findOne({ _id: req.params.fileId, classSlug: req.channel });
  if (!file) return res.status(404).end();
  const full = path.join(FILES_ROOT, req.channel, file.storedName);
  const inline = INLINE_MIME.test(file.mime);
  res.set({
    'Content-Type': inline ? file.mime : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': `default-src 'none'; media-src 'self'; img-src 'self'; frame-ancestors 'self' ${corsOrigin}`,
    'Cache-Control': 'private, max-age=3600',
  });
  res.removeHeader('X-Frame-Options');
  res.sendFile(full, (err) => { if (err && !res.headersSent) res.status(404).end(); });
});

router.delete('/:channel/files/:fileId', loadTarget, requireStaff, requireClass, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.fileId)) return res.status(404).end();
  const file = await ClassFile.findOneAndDelete({ _id: req.params.fileId, classSlug: req.channel });
  if (file) {
    fs.promises.unlink(path.join(FILES_ROOT, req.channel, file.storedName)).catch(() => {});
    ClassBoard.deleteMany({ classSlug: req.channel, key: new RegExp(`^file:${file._id}:`) }).catch(() => {});
    if (String(req.target.settings?.stage?.content?.id) === String(file._id)) {
      const stage = { ...req.target.settings.stage, content: null };
      req.target.settings = { ...req.target.settings, stage };
      req.target.markModified('settings');
      await req.target.save();
      await broadcast(req.channel, { type: 'stage', stage });
    }
  }
  res.status(204).end();
});

// ---- participants (host controls) ---------------------------------------
router.get('/:channel/participants', loadTarget, requireStaff, async (req, res) => {
  let list = [];
  try { list = await roomService().listParticipants(roomName(req.channel)); } catch { /* room not created yet */ }
  res.json(list.filter((p) => !p.identity.startsWith('monitor:') && !p.identity.startsWith('ingress:')).map((p) => ({
    identity: p.identity,
    name: p.name,
    isStaff: p.identity.startsWith('staff:'),
    handRaised: p.attributes?.hand === '1',
    canPublish: Boolean(p.permission?.canPublish),
    sources: (p.permission?.canPublishSources || []).map((s) => Object.keys(SOURCE).find((k) => SOURCE[k] === s)).filter(Boolean),
    publishing: (p.tracks || []).map((t) => t.source),
    joinedAt: Number(p.joinedAt) * 1000,
  })));
});

router.post('/:channel/participants/:identity', loadTarget, requireStaff, async (req, res) => {
  const { identity } = req.params;
  if (identity.startsWith('staff:')) return res.status(400).json({ error: 'روی مدیر کلاس قابل اجرا نیست.' });
  const room = roomName(req.channel);
  const svc = roomService();
  const { action } = req.body || {};
  if (action === 'allow') {
    const sources = (Array.isArray(req.body.sources) && req.body.sources.length ? req.body.sources : ['microphone', 'camera']).map((s) => SOURCE[s]).filter(Boolean);
    await svc.updateParticipant(room, identity, undefined, { canPublish: true, canSubscribe: true, canPublishData: true, canUpdateMetadata: true, canPublishSources: sources });
  } else if (action === 'revoke') {
    await svc.updateParticipant(room, identity, undefined, { canPublish: false, canSubscribe: true, canPublishData: true, canUpdateMetadata: true, canPublishSources: [] });
  } else if (action === 'mute') {
    const info = (await svc.listParticipants(room)).find((p) => p.identity === identity);
    for (const track of info?.tracks || []) if (!track.muted) await svc.mutePublishedTrack(room, identity, track.sid, true).catch(() => {});
  } else if (action === 'kick') {
    await svc.removeParticipant(room, identity);
  } else if (action === 'lower-hand') {
    await broadcast(req.channel, { type: 'lower-hand' }, [identity]);
  } else {
    return res.status(400).json({ error: 'عملیات نامعتبر است.' });
  }
  res.json({ ok: true });
});

router.post('/:channel/request', loadTarget, requireStaff, async (req, res) => {
  const { identity, kind } = req.body || {};
  if (!['screen', 'camera', 'microphone', 'screen_audio'].includes(kind)) return res.status(400).json({ error: 'نوع درخواست نامعتبر است.' });
  await broadcast(req.channel, { type: 'request', kind }, identity ? [identity] : []);
  res.json({ ok: true });
});

router.post('/:channel/mute-all', loadTarget, requireStaff, async (req, res) => {
  const room = roomName(req.channel);
  const svc = roomService();
  const list = await svc.listParticipants(room).catch(() => []);
  for (const p of list) {
    if (p.identity.startsWith('staff:') || p.identity.startsWith('ingress:')) continue;
    for (const track of p.tracks || []) if (!track.muted && track.source !== TrackSource.SCREEN_SHARE) await svc.mutePublishedTrack(room, p.identity, track.sid, true).catch(() => {});
  }
  res.json({ ok: true });
});

module.exports = router;
