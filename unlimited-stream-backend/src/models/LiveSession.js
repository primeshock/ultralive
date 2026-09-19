const mongoose = require('mongoose');

const liveSessionSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    startedAt: { type: Date, default: Date.now, index: true },
    endedAt: { type: Date, default: null },
    status: { type: String, enum: ['scheduled', 'live', 'ended'], default: 'live', index: true },
    peakParticipants: { type: Number, default: 0, min: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

liveSessionSchema.index({ classId: 1, status: 1, startedAt: -1 });
liveSessionSchema.index({ classId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'live' } });

module.exports = mongoose.model('LiveSession', liveSessionSchema);