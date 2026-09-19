const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveSession', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
    duration: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

attendanceSchema.index({ sessionId: 1, studentId: 1, joinedAt: 1 });
attendanceSchema.index({ sessionId: 1, leftAt: 1 });
attendanceSchema.index(
  { sessionId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { leftAt: null } }
);

module.exports = mongoose.model('Attendance', attendanceSchema);