const mongoose = require('mongoose');

const attendanceLogSchema = new mongoose.Schema(
  {
    channel: { type: String, required: true, lowercase: true, index: true },
    externalUserId: { type: String, required: true },
    displayName: { type: String, default: '' },
    joinedAt: { type: Date, default: Date.now, expires: '180d' },
  },
  { timestamps: false }
);

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);
