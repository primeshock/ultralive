const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    action: { type: String, enum: ['login', 'logout'], required: true },
    ip: { type: String, default: '' },
    at: { type: Date, default: Date.now, expires: '90d' }, // auto-cleanup old logs
  },
  { timestamps: false }
);

module.exports = mongoose.model('LoginLog', loginLogSchema);
