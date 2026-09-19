const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: /^[a-z0-9_]+$/,
    },
    passwordHash: { type: String, required: true },
    // Stored for future use only — registration form field is disabled ("soon"), never sent by the client today.
    email: { type: String, default: '' },
    streamKey: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, default: '' },
    streamTitle: { type: String, default: '', maxlength: 140 },
    donateUrl: { type: String, default: '' },
    autoChatMessage: {
      text: { type: String, default: '', maxlength: 200 },
      intervalMinutes: { type: Number, default: 10, min: 1, max: 120 },
      enabled: { type: Boolean, default: false },
    },
    isLive: { type: Boolean, default: false, index: true },
    chatEnabled: { type: Boolean, default: true },
    // Usernames muted in this streamer's chat (lowercase). Muting is per-channel,
    // not a site-wide ban. Kept for backward compatibility — new timed
    // mutes/bans for institutional use live in the separate Moderation model.
    mutedUsers: { type: [String], default: [] },
    // Only jpg is accepted (see utils/upload.js) so no extension needs tracking.
    thumbnailVersion: { type: Number, default: 0 },

    // --- Added for institutional / role-based use ---
    // 'owner'   → you: master panel, can create admins and channels
    // 'admin'   → manages a set of channels (classes) via the admin panel
    // 'teacher' → a normal broadcaster account (this is what "channel" meant before)
    role: { type: String, enum: ['owner', 'admin', 'teacher', 'student'], default: 'teacher' },
    // Which admin created/manages this channel. Only meaningful when role === 'teacher'.
    managedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // 'public'  → everyone in chat sees everyone else's messages (original behavior)
    // 'private' → students only see their own messages + this channel owner's/admin's messages
    chatMode: { type: String, enum: ['public', 'private'], default: 'public' },
    showViewerCount: { type: Boolean, default: false },
    accessMode: { type: String, enum: ['private', 'public'], default: 'private' },
    publicAccessToken: { type: String, default: '', select: false },

    // --- LiveKit Ingress (Phase 6) — empty until an admin provisions one ---
    livekitIngressId: { type: String, default: '' },
    livekitIngressUrl: { type: String, default: '' },
    livekitStreamKey: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
