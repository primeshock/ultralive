const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 80 },
    prefix: { type: String, required: true },
    hash: { type: String, required: true, unique: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastUsedAt: { type: Date, default: null },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApiKey', apiKeySchema);
