const mongoose = require('mongoose');

const studentGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  },
  { timestamps: true }
);

studentGroupSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('StudentGroup', studentGroupSchema);
