const mongoose = require('mongoose');

const classEnrollmentSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, enum: ['manual', 'group', 'api'], default: 'manual' },
  },
  { timestamps: true }
);

classEnrollmentSchema.index({ organizationId: 1, classId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('ClassEnrollment', classEnrollmentSchema);
