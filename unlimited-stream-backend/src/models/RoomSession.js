const mongoose = require('mongoose');

const roomSessionSchema = new mongoose.Schema(
  {
    channel: { type: String, required: true, lowercase: true },
    externalUserId: { type: String, required: true }, // WordPress user id
    displayName: { type: String, default: '' }, // from the WP token, for chat display
    sessionId: { type: String, required: true, unique: true },
    deviceId: { type: String, required: true },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL: Mongo deletes the doc itself once expiresAt passes.
roomSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// The actual "one session per student per class" guarantee:
roomSessionSchema.index({ channel: 1, externalUserId: 1 }, { unique: true });

module.exports = mongoose.model('RoomSession', roomSessionSchema);
