const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  channel: { type: String, required: true, lowercase: true, index: true },
  username: { type: String, default: null }, // null for system messages
  text: { type: String, required: true, maxlength: 300 },
  kind: { type: String, enum: ['user', 'system'], default: 'user' },
  // Internal identity used for private-mode filtering — real username for
  // staff, or the WordPress user id for students. Not shown to viewers.
  senderKey: { type: String, default: null },
  senderType: { type: String, enum: ['staff', 'student', 'system'], default: 'staff' },
  // Phase B: lets a message reference an earlier one it's replying to.
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
  // TTL: chat history auto-expires so it doesn't grow forever — this is for
  // surviving a refresh/reconnect, not a permanent chat log.
  createdAt: { type: Date, default: Date.now, expires: '7d' },
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
