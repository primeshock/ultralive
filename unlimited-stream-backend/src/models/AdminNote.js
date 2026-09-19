const mongoose = require('mongoose');

const adminNoteSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: true }
);

adminNoteSchema.index({ classId: 1, createdAt: -1 });

module.exports = mongoose.model('AdminNote', adminNoteSchema);