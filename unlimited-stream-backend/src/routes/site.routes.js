const express = require('express');
const SiteSettings = require('../models/SiteSettings');
const router = express.Router();
router.get('/settings', async (_req, res) => {
  const s = await SiteSettings.get();
  res.json({ siteName: s.siteName, logoUrl: s.logoUrl, faviconUrl: s.faviconUrl, accentColor: s.accentColor });
});
module.exports = router;
