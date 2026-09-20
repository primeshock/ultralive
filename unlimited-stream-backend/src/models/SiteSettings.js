const mongoose = require('mongoose');
const { recommendedLivekitSettings } = require('../utils/livekitSettings');

// Always exactly one document (findOneAndUpdate with upsert, no _id filter needed
// beyond a fixed key) — the "تنظیمات ظاهری و فنی" the owner controls.
const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },
    siteName: { type: String, default: 'Ultra Live' },
    browserTabTitle: { type: String, default: 'Ultra Live' },
    adminPath: { type: String, default: 'admin' },
    logoUrl: { type: String, default: '' },
    logoVersion: { type: Number, default: 0 },
    faviconUrl: { type: String, default: '' },
    faviconVersion: { type: Number, default: 0 },
    allowPublicRegister: { type: Boolean, default: true },
    playbackMode: { type: String, enum: ['auto', 'livekit', 'hls'], default: 'auto' },
    livekit: { type: Object, default: recommendedLivekitSettings },
    appearance: {
      preset: { type: String, enum: ['aurora', 'gemini', 'apple-dark', 'custom'], default: 'aurora' },
      backgroundUrl: { type: String, default: '' },
      backgroundDarkness: { type: Number, default: 52 },
      glassOpacity: { type: Number, default: 62 },
      glassBlur: { type: Number, default: 22 },
      glowIntensity: { type: Number, default: 55 },
      backgroundVersion: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

siteSettingsSchema.statics.get = async function () {
  let doc = await this.findOne({ key: 'main' });
  if (!doc) doc = await this.create({ key: 'main' });
  return doc;
};

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
