const mongoose = require('mongoose');

const recordingSchema = new mongoose.Schema(
  {
    classSlug: { type: String, required: true, lowercase: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    egressId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['recording', 'finishing', 'ready', 'failed'], default: 'recording' },
    file: { type: String, default: '' }, // path relative to the recordings directory
    size: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    startedBy: { type: String, default: '' },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Recording', recordingSchema);
