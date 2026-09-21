const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    externalId: { type: String, required: true, trim: true },
    name: { type: String, default: '', maxlength: 160 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, unique: true, sparse: true, index: true },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE', index: true },
    integrationMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  },
  { timestamps: true }
);

studentSchema.index({ organizationId: 1, externalId: 1 }, { unique: true });

module.exports = mongoose.model('Student', studentSchema);