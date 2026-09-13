const mongoose = require('mongoose');

// One row per active restriction. Channel = the class channel username (that IS
// the room in this codebase — no separate Room collection needed).
const moderationSchema = new mongoose.Schema(
  {
    channel: { type: String, required: true, lowercase: true, index: true },
    // The WordPress user id for students (they have no local User account).
    externalUserId: { type: String, required: true, index: true },
    type: { type: String, enum: ['mute', 'ban'], required: true },
    scope: { type: String, enum: ['timed', 'permanent'], required: true },
    expiresAt: { type: Date, default: null }, // null when scope === 'permanent'
    reason: { type: String, default: '' },
    createdBy: { type: String, required: true }, // admin's User._id
  },
  { timestamps: true }
);

moderationSchema.statics.isActive = function (doc) {
  if (!doc) return false;
  return doc.scope === 'permanent' || (doc.expiresAt && doc.expiresAt > new Date());
};

module.exports = mongoose.model('Moderation', moderationSchema);
