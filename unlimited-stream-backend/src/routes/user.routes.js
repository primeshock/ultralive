const express = require('express');
const {
  updateProfile,
  regenerateKey,
  toggleChat,
  uploadThumbnail,
  muteUser,
  unmuteUser,
} = require('../controllers/user.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const { thumbnailUpload } = require('../utils/upload');

const router = express.Router();

router.patch('/profile', requireAuth, updateProfile);
router.post('/regenerate-key', requireAuth, regenerateKey);
router.post('/chat-toggle', requireAuth, toggleChat);
router.post('/thumbnail', requireAuth, thumbnailUpload.single('thumbnail'), uploadThumbnail);
router.post('/mute', requireAuth, muteUser);
router.post('/unmute', requireAuth, unmuteUser);

module.exports = router;
