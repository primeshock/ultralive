const mongoose = require('mongoose');

const classSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    description: { type: String, default: '', maxlength: 2000 },
    visibility: { type: String, enum: ['public', 'private'], default: 'private', index: true },
    accessModes: { type: [String], enum: ['login', 'api', 'public', 'guest'], default: ['login'] },
    guestAccess: { type: Boolean, default: false },
    // Kept optional for legacy streaming records; academic classes do not need a channel.
    channel: { type: String, trim: true, lowercase: true, unique: true, sparse: true, index: true },
    displayName: { type: String, default: '' },
    streamTitle: { type: String, default: '', maxlength: 140 },
    donateUrl: { type: String, default: '' },
    streamKey: { type: String, default: '', select: false },
    isLive: { type: Boolean, default: false, index: true },
    chatEnabled: { type: Boolean, default: true },
    mutedUsers: { type: [String], default: [] },
    chatMode: { type: String, enum: ['public', 'private'], default: 'public' },
    showViewerCount: { type: Boolean, default: false },
    thumbnailVersion: { type: Number, default: 0 },
    accessMode: { type: String, enum: ['private', 'public'], default: 'private' },
    publicAccessToken: { type: String, default: '', select: false },
    livekitIngressId: { type: String, default: '' },
    livekitIngressUrl: { type: String, default: '' },
    livekitStreamKey: { type: String, default: '' },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  { timestamps: true }
);

classSchema.virtual('username').get(function getUsername() {
  return this.slug;
});

classSchema.index({ ownerId: 1, createdAt: -1 });
classSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('Class', classSchema);