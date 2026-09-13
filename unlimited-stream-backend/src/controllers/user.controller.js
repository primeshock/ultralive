const fs = require('fs/promises');
const path = require('path');
const { generateStreamKey } = require('../utils/streamKey');
const { ownerUser } = require('../utils/serialize');
const { isJpeg } = require('../utils/upload');
const { setChatEnabled, syncAutoReminder, muteUser: chatMuteUser, unmuteUser: chatUnmuteUser } = require('../services/chat');
const { serverIp, rtmpPort, publicPort: apiPort } = require('../config/env');

const mediaCtx = { serverIp, rtmpPort, apiPort };
const THUMBNAIL_DIR = path.join(process.cwd(), 'media', 'thumbnails');

async function updateProfile(req, res) {
  const user = req.user;
  const { streamTitle, donateUrl, autoChatMessage } = req.body || {};

  if (typeof streamTitle === 'string') user.streamTitle = streamTitle.slice(0, 140);
  if (typeof donateUrl === 'string') user.donateUrl = donateUrl.slice(0, 300);

  if (autoChatMessage && typeof autoChatMessage === 'object') {
    if (typeof autoChatMessage.text === 'string') {
      user.autoChatMessage.text = autoChatMessage.text.slice(0, 200);
    }
    if (typeof autoChatMessage.intervalMinutes === 'number') {
      user.autoChatMessage.intervalMinutes = Math.min(120, Math.max(1, autoChatMessage.intervalMinutes));
    }
    if (typeof autoChatMessage.enabled === 'boolean') {
      user.autoChatMessage.enabled = autoChatMessage.enabled;
    }
  }

  await user.save();
  // Without this, changing the reminder text/interval/on-off while already live had
  // no effect until the stream was stopped and restarted (postPublish is the only
  // other place this timer gets (re)armed).
  if (user.isLive) syncAutoReminder(user.username, user.autoChatMessage);
  res.json({ user: ownerUser(user, mediaCtx) });
}

async function regenerateKey(req, res) {
  const user = req.user;
  user.streamKey = generateStreamKey();
  await user.save();
  res.json({ user: ownerUser(user, mediaCtx) });
}

async function toggleChat(req, res) {
  const user = req.user;
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled باید true یا false باشه' });
  }

  user.chatEnabled = enabled;
  await user.save();
  setChatEnabled(user.username, enabled);
  res.json({ user: ownerUser(user, mediaCtx) });
}

function normalizeTargetUsername(body) {
  const username = body && typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  return username;
}

async function muteUser(req, res) {
  const user = req.user;
  const target = normalizeTargetUsername(req.body);
  if (!target) return res.status(400).json({ error: 'username لازمه' });
  if (target === user.username) return res.status(400).json({ error: 'نمی‌تونی خودتو میوت کنی' });

  if (!user.mutedUsers.includes(target)) {
    user.mutedUsers.push(target);
    await user.save();
  }
  chatMuteUser(user.username, target);
  res.json({ user: ownerUser(user, mediaCtx) });
}

async function unmuteUser(req, res) {
  const user = req.user;
  const target = normalizeTargetUsername(req.body);
  if (!target) return res.status(400).json({ error: 'username لازمه' });

  user.mutedUsers = user.mutedUsers.filter((u) => u !== target);
  await user.save();
  chatUnmuteUser(user.username, target);
  res.json({ user: ownerUser(user, mediaCtx) });
}

async function uploadThumbnail(req, res) {
  const user = req.user;
  if (!req.file) {
    return res.status(400).json({ error: 'فایل تصویر ارسال نشده' });
  }

  // The mimetype check in the multer fileFilter only looked at what the client
  // claimed. This checks the actual bytes so a relabeled SVG/HTML/script file
  // can't get stored (and later served back) as a "jpg".
  if (!isJpeg(req.file.buffer)) {
    return res.status(400).json({ error: 'فایل باید یک عکس jpg واقعی باشه' });
  }

  await fs.mkdir(THUMBNAIL_DIR, { recursive: true });
  await fs.writeFile(path.join(THUMBNAIL_DIR, `${user.username}.jpg`), req.file.buffer);

  user.thumbnailVersion += 1;
  await user.save();
  res.json({ user: ownerUser(user, mediaCtx) });
}

module.exports = { updateProfile, regenerateKey, toggleChat, uploadThumbnail, muteUser, unmuteUser };
