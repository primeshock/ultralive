const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const RoomSession = require('../models/RoomSession');
const Moderation = require('../models/Moderation');
const AttendanceLog = require('../models/AttendanceLog');
const { verifyWpToken, signRoomSession } = require('../utils/joinToken');
const Class = require('../models/Class');
const { findStreamTarget, streamName } = require('../utils/streamTarget');

const { readGuest, writeGuest, cleanName, newGuestId } = require('../utils/publicGuest');
const router = express.Router();
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6h — tune to your longest class length

router.get('/join', async (req, res) => {
  let payload;
  try {
    payload = verifyWpToken(req.query.token);
  } catch {
    return res.status(401).send('لینک نامعتبر یا منقضی شده است.');
  }

  const channel = String(payload.channel || '').toLowerCase();
  const target = await findStreamTarget(channel);
  if (!target) return res.status(404).send('کلاس پیدا نشد.');

  const ban = await require('../services/moderation').active(channel, payload.userId, 'ban');
  if (Moderation.isActive(ban)) {
    return res
      .status(403)
      .send(ban.scope === 'permanent' ? 'شما از این کلاس محروم شده‌اید.' : 'شما موقتاً از این کلاس محروم هستید.');
  }

  const deviceCookie = req.cookies?.[`device_${channel}`];
  const existing = await RoomSession.findOne({ channel, externalUserId: payload.userId });

  if (existing) {
    const stillValid = existing.expiresAt > new Date();
    const sameDevice = deviceCookie && deviceCookie === existing.deviceId;

    if (stillValid && !sameDevice) {
      return res.status(409).send('این حساب هم‌اکنون از یک دستگاه دیگر در این کلاس فعال است.');
    }
    if (stillValid && sameDevice) {
      existing.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      await existing.save();
      return issueCookiesAndRedirect(res, channel, existing);
    }
    await existing.deleteOne(); // expired, clean up
  }

  const session = await RoomSession.create({
    channel,
    externalUserId: payload.userId,
    displayName: payload.displayName || '',
    sessionId: crypto.randomUUID(),
    deviceId: deviceCookie || crypto.randomUUID(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  issueCookiesAndRedirect(res, channel, session);
  AttendanceLog.create({
    channel,
    externalUserId: payload.userId,
    displayName: payload.displayName || '',
  }).catch(() => {});
});

router.get('/public/:token', async (req, res) => {
  const token = req.params.token;
  const [classDoc, teacher] = await Promise.all([
    Class.findOne({ publicAccessToken: token, $or: [{ accessMode: 'public' }, { accessModes: { $in: ['public', 'guest'] } }, { guestAccess: true }] }).select('+publicAccessToken'),
    User.findOne({ publicAccessToken: token, accessMode: 'public', role: 'teacher' }).select('+publicAccessToken'),
  ]);
  const target = classDoc || teacher;
  if (!target || (target.constructor?.modelName === 'Class' && !target.guestAccess && target.accessMode !== 'public' && !(target.accessModes || []).includes('guest'))) return res.status(404).send('لینک همگانی نامعتبر یا غیرفعال است.');
  const channel = streamName(target);
  res.cookie(`public_class_${channel}`, target.publicAccessToken, { httpOnly: true, sameSite: 'lax', secure: require('../config/env').cookieSecure, maxAge: SESSION_TTL_MS });
  res.redirect(`/channel/${channel}`);
});

// Public-link guests: no account, just a display name they choose (and may change later).
async function guestStatus(req, channel) {
  if (!(await require('../utils/classAccess').canAccessClass(channel, req.cookies || {}))) return { guest: false, allowed: false };
  // a logged-in account or a room-session student is not a guest
  const { COOKIE_NAME, verifyToken } = require('../utils/jwt');
  try { if (req.cookies?.[COOKIE_NAME] && verifyToken(req.cookies[COOKIE_NAME])) return { guest: false, allowed: true }; } catch { /* not logged in */ }
  try { await require('../utils/checkStudentAccess').checkStudentAccess(channel, req.cookies || {}); return { guest: false, allowed: true }; } catch { /* not a room-session student */ }
  return { guest: true, allowed: true };
}

router.get('/public-guest/:channel', async (req, res) => {
  const channel = String(req.params.channel || '').toLowerCase();
  const status = await guestStatus(req, channel);
  const guest = status.guest ? readGuest(req.cookies, channel) : null;
  res.json({ guest: status.guest, name: guest?.name || '' });
});

router.post('/public-guest/:channel', async (req, res) => {
  const channel = String(req.params.channel || '').toLowerCase();
  const status = await guestStatus(req, channel);
  if (!status.allowed) return res.status(403).json({ error: 'دسترسی ندارید.' });
  if (!status.guest) return res.status(400).json({ error: 'این بخش فقط برای ورود با لینک همگانی است.' });
  const name = cleanName(req.body?.name);
  if (name.length < 2) return res.status(400).json({ error: 'نام باید حداقل ۲ حرف باشد.' });
  const current = readGuest(req.cookies, channel);
  writeGuest(res, channel, { id: current?.id || newGuestId(), name });
  res.json({ ok: true, name });
});

router.get('/access/:channel', async (req, res) => {
  const { canAccessClass } = require('../utils/classAccess');
  const channel = String(req.params.channel || '').toLowerCase();
  const target = await findStreamTarget(channel);
  const modes = target?.accessModes?.length ? target.accessModes : target?.accessMode === 'public' || target?.visibility === 'public' ? ['public'] : ['login'];
  res.json({
    allowed: await canAccessClass(channel, req.cookies || {}),
    loginAllowed: modes.includes('login'),
    guestAllowed: Boolean(target && (target.guestAccess || modes.includes('guest'))),
  });
});

router.post('/guest/:channel', async (req, res) => {
  const channel = String(req.params.channel || '').toLowerCase();
  const target = await findStreamTarget(channel);
  const modes = target?.accessModes?.length ? target.accessModes : [];
  if (!target || (!target.guestAccess && !modes.includes('guest'))) return res.status(403).json({ error: 'ورود مهمان برای این کلاس فعال نیست.' });

  const phone = String(req.body?.phone || req.body?.displayName || '')
    .trim()
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  if (!/^09\d{9}$/.test(phone)) return res.status(400).json({ error: 'شماره موبایل باید ۱۱ رقمی و با ۰۹ شروع شود.' });

  const externalUserId = `guest-${crypto.randomBytes(12).toString('hex')}`;
  const deviceId = crypto.randomUUID();
  const session = await RoomSession.create({
    channel,
    externalUserId,
    displayName: phone,
    sessionId: crypto.randomUUID(),
    deviceId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: require('../config/env').cookieSecure, maxAge: SESSION_TTL_MS };
  res.cookie(`device_${channel}`, deviceId, cookieOpts);
  res.cookie(`room_session_${channel}`, signRoomSession({ channel, externalUserId, sessionId: session.sessionId, deviceId }), cookieOpts);
  res.json({ ok: true, channel });
});

function issueCookiesAndRedirect(res, channel, session) {
  const token = signRoomSession({
    channel,
    externalUserId: session.externalUserId,
    sessionId: session.sessionId,
    deviceId: session.deviceId,
  });

  // secure:false to match the existing us_token cookie (no HTTPS in this deployment).
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: require('../config/env').cookieSecure, maxAge: SESSION_TTL_MS };
  res.cookie(`device_${channel}`, session.deviceId, cookieOpts);
  res.cookie(`room_session_${channel}`, token, cookieOpts);
  res.redirect(`/channel/${channel}`);
}

module.exports = router;
