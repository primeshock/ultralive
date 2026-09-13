const mongoose = require('mongoose');
const crypto = require('crypto');

const monitorLinkSchema = new mongoose.Schema(
  {
    channel: { type: String, required: true, unique: true, lowercase: true },
    token: { type: String, required: true, unique: true },
    active: { type: Boolean, default: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

monitorLinkSchema.statics.generateToken = function () {
  return crypto.randomBytes(24).toString('hex');
};

module.exports = mongoose.model('MonitorLink', monitorLinkSchema);
