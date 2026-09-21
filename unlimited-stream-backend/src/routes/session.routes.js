const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const RoomSession = require('../models/RoomSession');
const Moderation = require('../models/Moderation');
const AttendanceLog = require('../models/AttendanceLog');
const { verifyWpToken, signRoomSession } = require('../utils/joinToken');
const Class = require('../models/Class');
const { findStreamTarget, streamName } = require('../utils/streamTarget');

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

  const ban = await Moderation.findOne({ channel, externalUserId: payload.userId, type: 'ban' }).sort({
    createdAt: -1,
  });
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
    Class.findOne({ publicAccessToken: token, accessMode: 'public' }).select('+publicAccessToken'),
    User.findOne({ publicAccessToken: token, accessMode: 'public', role: 'teacher' }).select('+publicAccessToken'),
  ]);
  const target = classDoc || teacher;
  if (!target) return res.status(404).send('لینک همگانی نامعتبر یا غیرفعال است.');
  const channel = streamName(target);
  res.cookie(`public_class_${channel}`, target.publicAccessToken, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: SESSION_TTL_MS });
  res.redirect(`/channel/${channel}`);
});

router.get('/access/:channel', async (req, res) => {
  const { canAccessClass } = require('../utils/classAccess');
  const channel = String(req.params.channel || '').toLowerCase();
  res.json({ allowed: await canAccessClass(channel, req.cookies || {}) });
});

function issueCookiesAndRedirect(res, channel, session) {
  const token = signRoomSession({
    channel,
    externalUserId: session.externalUserId,
    sessionId: session.sessionId,
    deviceId: session.deviceId,
  });

  // secure:false to match the existing us_token cookie (no HTTPS in this deployment).
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: false, maxAge: SESSION_TTL_MS };
  res.cookie(`device_${channel}`, session.deviceId, cookieOpts);
  res.cookie(`room_session_${channel}`, token, cookieOpts);
  res.redirect(`/channel/${channel}`);
}

module.exports = router;
