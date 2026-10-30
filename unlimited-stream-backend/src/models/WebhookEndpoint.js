const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    url: { type: String, required: true, maxlength: 500 },
    secret: { type: String, required: true },
    events: { type: [String], default: ['*'] },
    active: { type: Boolean, default: true },
    lastStatus: { type: Number, default: null },
    lastDeliveryAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WebhookEndpoint', webhookSchema);
