const RoomSession = require('../models/RoomSession');
const Moderation = require('../models/Moderation');
const { verifyRoomSession } = require('./joinToken');

/**
 * Validates a student's cookie-based room session for a given channel.
 * Throws on any failure (no cookie, tampered JWT, session taken over by
 * another device, expired, or an active ban).
 */
async function checkStudentAccess(channel, cookies) {
  const token = cookies[`room_session_${channel}`];
  if (!token) throw new Error('no session cookie');

  const payload = verifyRoomSession(token); // throws if tampered/expired
  if (payload.channel !== channel) throw new Error('channel mismatch');

  const session = await RoomSession.findOne({ channel, externalUserId: payload.externalUserId });
  const valid =
    session &&
    session.sessionId === payload.sessionId &&
    session.deviceId === payload.deviceId &&
    session.expiresAt > new Date();
  if (!valid) throw new Error('session no longer valid');

  const ban = await Moderation.findOne({ channel, externalUserId: payload.externalUserId, type: 'ban' }).sort({
    createdAt: -1,
  });
  if (Moderation.isActive(ban)) throw new Error('banned');

  session.lastSeenAt = new Date();
  session.save().catch(() => {});

  return { externalUserId: payload.externalUserId, displayName: session.displayName, session };
}

module.exports = { checkStudentAccess };
