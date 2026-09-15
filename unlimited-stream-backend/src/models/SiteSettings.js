const mongoose = require('mongoose');

// Always exactly one document (findOneAndUpdate with upsert, no _id filter needed
// beyond a fixed key) — the "تنظیمات ظاهری و فنی" the owner controls.
const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },
    siteName: { type: String, default: 'Koosha Live' },
    logoUrl: { type: String, default: '' },
    logoVersion: { type: Number, default: 0 },
    allowPublicRegister: { type: Boolean, default: true },
    playbackMode: { type: String, enum: ['auto', 'livekit', 'hls'], default: 'auto' },
  },
  { timestamps: true }
);

siteSettingsSchema.statics.get = async function () {
  let doc = await this.findOne({ key: 'main' });
  if (!doc) doc = await this.create({ key: 'main' });
  return doc;
};

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
