const mongoose = require('mongoose');

// Annotation layer for one board page or one PDF page: key = "board:1" or "file:<id>:3".
const classBoardSchema = new mongoose.Schema(
  {
    classSlug: { type: String, required: true, lowercase: true },
    key: { type: String, required: true, maxlength: 80 },
    strokes: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);
classBoardSchema.index({ classSlug: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('ClassBoard', classBoardSchema);
