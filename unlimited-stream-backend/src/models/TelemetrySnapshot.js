const mongoose = require('mongoose');

const telemetrySnapshotSchema = new mongoose.Schema(
  {
    capturedAt: { type: Date, default: Date.now },
    serverUptimeSeconds: { type: Number, min: 0, default: null },
    cpu: { type: Number, min: 0, max: 100, default: null },
    ramUsed: { type: Number, min: 0, default: null },
    ramTotal: { type: Number, min: 0, default: null },
    networkRx: { type: Number, min: 0, default: null },
    networkTx: { type: Number, min: 0, default: null },
    activeRooms: { type: Number, min: 0, default: 0 },
    activeParticipants: { type: Number, min: 0, default: 0 },
    activePublishers: { type: Number, min: 0, default: 0 },
    services: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { versionKey: false }
);

// Keep one day of five-second samples; the collector also trims periodically.
telemetrySnapshotSchema.index({ capturedAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('TelemetrySnapshot', telemetrySnapshotSchema);
