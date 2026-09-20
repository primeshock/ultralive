const mongoose = require('mongoose');

const classSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    description: { type: String, default: '', maxlength: 2000 },
    visibility: { type: String, enum: ['public', 'private'], default: 'private', index: true },
    // Kept optional for legacy streaming records; academic classes do not need a channel.
    channel: { type: String, trim: true, lowercase: true, unique: true, sparse: true, index: true },
    streamKey: { type: String, default: '', select: false },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  { timestamps: true }
);

classSchema.index({ ownerId: 1, createdAt: -1 });
classSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('Class', classSchema);