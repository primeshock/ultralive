const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true, match: /^[a-z0-9][a-z0-9-]{2,48}$/ },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE', index: true },
    logoVersion: { type: Number, default: 0 },
    classAppearance: { type: mongoose.Schema.Types.Mixed, default: {} },
    guestAccessDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Organization', organizationSchema);