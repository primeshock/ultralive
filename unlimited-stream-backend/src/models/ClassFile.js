const mongoose = require('mongoose');

const classFileSchema = new mongoose.Schema(
  {
    classSlug: { type: String, required: true, lowercase: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    name: { type: String, required: true, maxlength: 200 },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    storedName: { type: String, required: true },
    uploadedBy: { type: String, default: '' },
    // students only see (and may download) files the host explicitly sent to them
    studentVisible: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ClassFile', classFileSchema);
