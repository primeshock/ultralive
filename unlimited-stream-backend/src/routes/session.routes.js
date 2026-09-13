const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const RoomSession = require('../models/RoomSession');
const Moderation = require('../models/Moderation');
const AttendanceLog = require('../models/AttendanceLog');
const { verifyWpToken, signRoomSession } = require('../utils/joinToken');
const { cookieSecure } = require('../config/env');

const router = express.Router();
const { checkStudentAccess } = require('../utils/checkStudentAccess');
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6h — tune to your longest class length


router.get('/me', async (req, res) => {
  const channel = String(req.query.channel || '').toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(channel)) return res.status(400).json({ error: 'کلاس نامعتبر است.' });
  try {
    const access = await checkStudentAccess(channel, req.cookies || {});
    res.json({ authenticated: true, channel, externalUserId: access.externalUserId, displayName: access.displayName || access.externalUserId });
  } catch {
    res.status(401).json({ authenticated: false });
  }
});

router.get('/join', async (req, res) => {
  let payload;
  try {
    payload = verifyWpToken(req.query.token);
  } catch {
    return res.status(401).send('لینک نامعتبر یا منقضی شده است.');
  }

  const channel = String(payload.channel || '').toLowerCase();
  const classChannel = await User.findOne({ username: channel, role: 'channel' });
  if (!classChannel) return res.status(404).send('کلاس پیدا نشد.');

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

function issueCookiesAndRedirect(res, channel, session) {
  const token = signRoomSession({
    channel,
    externalUserId: session.externalUserId,
    sessionId: session.sessionId,
    deviceId: session.deviceId,
  });

  // secure:false to match the existing us_token cookie (no HTTPS in this deployment).
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: cookieSecure, maxAge: SESSION_TTL_MS };
  res.cookie(`device_${channel}`, session.deviceId, cookieOpts);
  res.cookie(`room_session_${channel}`, token, cookieOpts);
  res.redirect(`/channel/${channel}`);
}

module.exports = router;
