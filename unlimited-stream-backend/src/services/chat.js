const { Server } = require('socket.io');
const cookie = require('cookie');
const { COOKIE_NAME, verifyToken } = require('../utils/jwt');
const User = require('../models/User');
const ChatMessage = require('../models/ChatMessage');
const Moderation = require('../models/Moderation');
const { corsOrigin } = require('../config/env');
const { checkStudentAccess } = require('../utils/checkStudentAccess');
const { canAccessClass } = require('../utils/classAccess');
const { findStreamTarget } = require('../utils/streamTarget');
const Student = require('../models/Student');
const ClassEnrollment = require('../models/ClassEnrollment');

const HISTORY_LIMIT = 50;

let io = null;
const reminderTimers = new Map(); // username -> interval handle
const chatEnabledState = new Map(); // channel -> boolean
const mutedUsersState = new Map(); // channel -> Set<username>
const chatModeState = new Map(); // channel -> 'public' | 'private'
const slowModeState = new Map(); // channel -> seconds between messages per user (0 = off)
const pinnedState = new Map(); // channel -> { id, username, text } | null
const lastSent = new Map(); // `${channel}|${senderKey}` -> { at, text }

// periodically forget old anti-spam entries
setInterval(() => { const cutoff = Date.now() - 5 * 60 * 1000; for (const [k, v] of lastSent) if (v.at < cutoff) lastSent.delete(k); }, 60 * 1000).unref();

const SLOW_CHOICES = [0, 5, 15, 30, 60];
const pinnedPayload = (room) => pinnedState.get(room) || null;

async function ensureChannelStateLoaded(room) {
  if (chatEnabledState.has(room) && mutedUsersState.has(room) && chatModeState.has(room)) return;
  const owner = await findStreamTarget(room);
  if (!owner) return;
  if (!chatEnabledState.has(room)) chatEnabledState.set(room, owner.chatEnabled);
  if (!mutedUsersState.has(room)) mutedUsersState.set(room, new Set(owner.mutedUsers || []));
  if (!chatModeState.has(room)) chatModeState.set(room, owner.chatMode || 'public');
}

function isPrivateMode(channel) {
  return chatModeState.get(channel.toLowerCase()) === 'private';
}

function setChatMode(channel, mode) {
  chatModeState.set(channel.toLowerCase(), mode);
}

function initChat(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  // No longer rejects at handshake time — a student has no real account/JWT,
  // only a per-channel room-session cookie, and we don't know which channel
  // they want yet (that only arrives with the 'chat:join' event below). So
  // this just opportunistically identifies a real logged-in account if
  // present; identity is finalized per-channel in 'chat:join'.
  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.headers.cookie;
      const parsed = raw ? cookie.parse(raw) : {};
      socket.data.cookies = parsed; // needed later for the per-channel student check
      const token = parsed[COOKIE_NAME];
      if (token) {
        const payload = verifyToken(token);
        const user = await User.findById(payload.sub);
        if (user) {
          socket.data.username = user.username;
          socket.data.role = user.role;
          socket.data.userId = user._id;
          socket.data.displayName = user.displayName || user.username;
        }
      }
      next();
    } catch {
      next(); // bad/expired real-account cookie just means "not a real account" here
    }
  });

  io.on('connection', (socket) => {
    socket.on('chat:join', async (channel) => {
      if (typeof channel !== 'string' || !channel) return;
      const room = channel.toLowerCase();

      const target = await findStreamTarget(room);
      if (!target) { socket.emit('chat:error', { message: 'کلاس پیدا نشد.' }); return; }

      if (socket.data.username && ['STUDENT', 'student'].includes(socket.data.role)) {
        const student = await Student.findOne({ userId: socket.data.userId, organizationId: target.organizationId, status: 'ACTIVE' }).select('_id externalId name');
        const enrolled = target.constructor?.modelName === 'Class' && student && await ClassEnrollment.exists({ classId: target._id, studentId: student._id, organizationId: target.organizationId });
        if (!enrolled) { socket.emit('chat:error', { message: 'به چت این کلاس دسترسی ندارید.' }); return; }
        socket.data.studentId = student.externalId;
        socket.data.displayName = student.name || socket.data.displayName;
        socket.data.participantType = 'student';
      } else if (socket.data.username) {
        const sameOrganization = !target.organizationId || String(target.organizationId) === String(socket.data.organizationId || (await User.findById(socket.data.userId).select('organizationId'))?.organizationId || '');
        const canStaff = socket.data.role === 'SUPER_OWNER' || socket.data.role === 'owner' || (sameOrganization && ['ORGANIZATION_OWNER', 'ADMIN_L1', 'ADMIN_L2'].includes(socket.data.role)) || (target.username === socket.data.username) || (socket.data.role === 'admin' && String(target.managedBy || '') === String(socket.data.userId));
        if (!canStaff) { socket.emit('chat:error', { message: 'به چت این کلاس دسترسی ندارید.' }); return; }
        socket.data.participantType = 'staff';
      }

      // Establish identity for THIS channel. A real logged-in account (from
      // the handshake middleware above) is accepted for any channel, same as
      // before. Otherwise this must be a student with a valid room-session
      // cookie scoped to exactly this channel — checked fresh on every join
      // so a mid-class ban takes effect immediately, not just on next login.
      if (!socket.data.username) {
        try {
          const access = await checkStudentAccess(room, socket.data.cookies || {});
          socket.data.studentId = access.externalUserId; // internal identity key
          socket.data.displayName = access.displayName || access.externalUserId;
          socket.data.participantType = access.externalUserId.startsWith('guest-') ? 'guest' : 'student';
        } catch {
          if (!(await canAccessClass(room, socket.data.cookies || {}))) {
            socket.emit('chat:error', { message: 'برای چت باید از طریق سایت اصلی وارد شوید.' });
            return;
          }
          socket.data.studentId = `public:${socket.data.cookies[`public_class_${room}`]}`;
          socket.data.displayName = 'مهمان';
          socket.data.participantType = 'guest';
        }
      }

      if (socket.data.studentId && await require('./moderation').active(room, socket.data.studentId, 'ban')) {
        socket.emit('chat:error', { message: 'شما از این کلاس محروم شده‌اید.' });
        return;
      }
      socket.join(room);
      // Any real logged-in account (teacher/admin/owner) counts as staff for
      // this channel's private-chat filtering — students never have one.
      if (socket.data.participantType === 'staff') socket.join(`staff:${room}`);

      await ensureChannelStateLoaded(room);
      socket.emit('chat:state', { enabled: isChatEnabled(room), slow: slowModeState.get(room) || 0, pinned: pinnedPayload(room) });

      const isStaff = socket.data.participantType === 'staff';
      const senderKey = socket.data.participantType === 'staff' ? socket.data.username : socket.data.studentId;
      const mine = [senderKey, socket.data.username].filter(Boolean);
      const historyFilter =
        isPrivateMode(room) && !isStaff
          ? { channel: room, $or: [{ senderKey: { $in: mine } }, { toKey: { $in: mine } }, { senderType: 'staff', toKey: null }, { senderType: 'system' }] }
          : { channel: room };

      const history = await ChatMessage.find(historyFilter).sort({ createdAt: -1 }).limit(HISTORY_LIMIT).lean();
      history.reverse();
      socket.emit(
        'chat:history',
        history.map((m) => ({
          id: m._id,
          username: m.username,
          text: m.text,
          kind: m.kind,
          replyTo: m.replyTo,
          staff: m.senderType === 'staff',
          externalUserId: ['student', 'guest'].includes(m.senderType) ? m.senderKey : null,
          ts: m.createdAt.getTime(),
        }))
      );
    });

    socket.on('chat:message', async (payload) => {
      const channel = payload && typeof payload.channel === 'string' ? payload.channel.toLowerCase() : null;
      const text = payload && typeof payload.text === 'string' ? payload.text.trim().slice(0, 300) : '';
      const replyTo = payload && typeof payload.replyTo === 'string' ? payload.replyTo : null;
      if (!channel || !text || !socket.rooms.has(channel)) return;

      const isStaff = socket.data.participantType === 'staff';
      // A closed chat only blocks students — the host can still write and everyone sees it.
      if (!isChatEnabled(channel) && !isStaff) {
        socket.emit('chat:error', { message: 'چت بسته است' });
        return;
      }
      const username = socket.data.username || socket.data.displayName;
      const senderKey = socket.data.participantType === 'staff' ? socket.data.username : socket.data.studentId;
      if (!username) return; // never joined this channel's chat — ignore

      if (!isStaff) {
        const slow = slowModeState.get(channel) || 0;
        const key = `${channel}|${senderKey}`;
        const prev = lastSent.get(key);
        const now = Date.now();
        const gap = Math.max(slow * 1000, 700); // even with slow mode off: no more than ~1 message/second
        if (prev && now - prev.at < gap) {
          const wait = Math.ceil((gap - (now - prev.at)) / 1000);
          socket.emit('chat:error', { message: slow ? `هر ${slow} ثانیه یک پیام می‌توانید بفرستید (${wait} ثانیه دیگر)` : 'لطفاً کمی آهسته‌تر پیام بدهید' });
          return;
        }
        if (prev && prev.text === text && now - prev.at < 30 * 1000) {
          socket.emit('chat:error', { message: 'این پیام را همین حالا فرستادید' });
          return;
        }
        lastSent.set(key, { at: now, text });
      }

      if (isMuted(channel, socket.data.username || '')) {
        socket.emit('chat:error', { message: 'شما توسط مدیر سکوت شده‌اید' });
        return;
      }
      if (socket.data.studentId) {
        if (await require('./moderation').active(channel, socket.data.studentId, 'ban')) {
          socket.emit('chat:error', { message: 'شما از این کلاس محروم شده‌اید.' });
          return;
        }
        const activeMute = await require('./moderation').active(channel, socket.data.studentId, 'mute');
        if (Moderation.isActive(activeMute)) {
          socket.emit('chat:error', { message: 'شما موقتاً سکوت داده شده‌اید.' });
          return;
        }
      }

      // Private mode: a staff message that replies to someone goes only to that person; without a reply it is for everyone.
      let toKey = null;
      if (isStaff && replyTo && isPrivateMode(channel)) {
        const parent = await ChatMessage.findById(replyTo).select('senderKey senderType').lean().catch(() => null);
        if (parent && parent.senderType !== 'staff' && parent.senderKey) toKey = parent.senderKey;
      }

      let saved;
      try {
        saved = await ChatMessage.create({
          channel,
          username,
          text,
          kind: 'user',
          replyTo,
          senderKey,
          toKey,
          senderType: isStaff ? 'staff' : socket.data.participantType || 'student',
        });
      } catch (err) {
        console.error('[chat] failed to persist message', err);
      }

      const outgoing = {
        id: saved?._id,
        username,
        text,
        replyTo,
        externalUserId: isStaff ? null : senderKey,
        staff: isStaff,
        ts: Date.now(),
      };

      if (toKey) {
        // addressed reply: the person it is for, the sender and the other staff
        socket.emit('chat:message', { ...outgoing, private: true });
        for (const id of io.sockets.adapter.rooms.get(channel) || []) {
          const s = io.sockets.sockets.get(id);
          if (!s || s.id === socket.id) continue;
          if (s.data.participantType === 'staff' || s.data.studentId === toKey) s.emit('chat:message', { ...outgoing, private: true });
        }
      } else if (isPrivateMode(channel) && !isStaff) {
        // Private mode + student sender: only the sender and staff see it.
        socket.emit('chat:message', outgoing);
        io.to(`staff:${channel}`).emit('chat:message', outgoing);
      } else {
        // Public mode, or the sender IS staff (staff messages always broadcast).
        io.to(channel).emit('chat:message', outgoing);
      }
    });
  });

  io.on('connection', (socket) => {
    const staffRoom = (channel) => {
      const room = typeof channel === 'string' ? channel.toLowerCase() : '';
      return room && socket.rooms.has(room) && socket.data.participantType === 'staff' ? room : null;
    };
    socket.on('chat:slow', ({ channel, seconds } = {}) => {
      const room = staffRoom(channel);
      const n = Number(seconds);
      if (!room || !SLOW_CHOICES.includes(n)) return;
      slowModeState.set(room, n);
      io.to(room).emit('chat:state', { enabled: isChatEnabled(room), slow: n, pinned: pinnedPayload(room) });
    });
    socket.on('chat:pin', async ({ channel, id } = {}) => {
      const room = staffRoom(channel);
      if (!room) return;
      if (!id) pinnedState.set(room, null);
      else {
        const m = await ChatMessage.findOne({ _id: String(id), channel: room, kind: 'user' }).select('username text').lean().catch(() => null);
        if (!m) return;
        pinnedState.set(room, { id: String(m._id), username: m.username, text: m.text });
      }
      io.to(room).emit('chat:pinned', pinnedPayload(room));
    });
  });

  return io;
}

// Counts sockets that joined this channel's chat room. Since chat requires login
// (see io.use above), this only counts logged-in viewers, not anonymous HLS pulls —
// an approximation, not an exact concurrent-viewer count.
function getViewerCount(channel) {
  if (!io) return 0;
  const room = io.sockets.adapter.rooms.get(channel.toLowerCase());
  return room ? room.size : 0;
}

function isChatEnabled(channel) {
  const room = channel.toLowerCase();
  return chatEnabledState.has(room) ? chatEnabledState.get(room) : true;
}

function setChatEnabled(channel, enabled) {
  const room = channel.toLowerCase();
  chatEnabledState.set(room, enabled);
  io?.to(room).emit('chat:state', { enabled, slow: slowModeState.get(room) || 0, pinned: pinnedPayload(room) });
}

async function clearChat(channel) {
  const room = channel.toLowerCase();
  await ChatMessage.deleteMany({ channel: room });
  pinnedState.set(room, null);
  io?.to(room).emit('chat:pinned', null);
  io?.to(room).emit('chat:clear');
}

function isMuted(channel, username) {
  const set = mutedUsersState.get(channel.toLowerCase());
  return set ? set.has(username.toLowerCase()) : false;
}

function muteUser(channel, username) {
  const room = channel.toLowerCase();
  if (!mutedUsersState.has(room)) mutedUsersState.set(room, new Set());
  mutedUsersState.get(room).add(username.toLowerCase());
}

function unmuteUser(channel, username) {
  const room = channel.toLowerCase();
  mutedUsersState.get(room)?.delete(username.toLowerCase());
}

function disconnectModeratedUser(channel, externalUserId) {
  if (!io) return;
  const room = channel.toLowerCase();
  for (const socketId of io.sockets.adapter.rooms.get(room) || []) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket?.data.studentId === String(externalUserId)) {
      socket.emit('chat:error', { message: 'به دلیل بن شدن از کلاس خارج شدید.' });
      socket.disconnect(true);
    }
  }
}

async function broadcastSystemMessage(channel, text) {
  if (!io || !text) return;
  const room = channel.toLowerCase();
  io.to(room).emit('chat:system', { text, ts: Date.now() });
  try {
    await ChatMessage.create({ channel: room, username: null, text, kind: 'system' });
  } catch (err) {
    console.error('[chat] failed to persist system message', err);
  }
}

function startAutoReminder(username, text, intervalMinutes) {
  stopAutoReminder(username);
  if (!text) return;
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;
  const handle = setInterval(() => broadcastSystemMessage(username, text), ms);
  reminderTimers.set(username, handle);
}

function stopAutoReminder(username) {
  const handle = reminderTimers.get(username);
  if (handle) {
    clearInterval(handle);
    reminderTimers.delete(username);
  }
}

// Single source of truth for "should the auto-reminder be running right now",
// used both when a stream goes live and whenever the streamer edits the setting
// while already live — so changes take effect immediately instead of only on the
// next stream start.
function syncAutoReminder(username, autoChatMessage) {
  if (autoChatMessage && autoChatMessage.enabled && autoChatMessage.text) {
    startAutoReminder(username, autoChatMessage.text, autoChatMessage.intervalMinutes);
  } else {
    stopAutoReminder(username);
  }
}

module.exports = {
  initChat,
  broadcastSystemMessage,
  startAutoReminder,
  stopAutoReminder,
  syncAutoReminder,
  isChatEnabled,
  setChatEnabled,
  clearChat,
  isMuted,
  muteUser,
  unmuteUser,
  disconnectModeratedUser,
  getViewerCount,
  setChatMode,
  isPrivateMode,
};
