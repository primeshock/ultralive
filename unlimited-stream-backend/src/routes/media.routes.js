const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const THUMBNAIL_DIR = path.join(process.cwd(), 'media', 'thumbnails');
const THUMBNAIL_FILE_RE = /^([a-z0-9_]{3,24})\.jpg$/;
const LOGO_DIR = path.join(process.cwd(), 'media');

router.get('/thumbnails/:file', (req, res) => {
  const match = THUMBNAIL_FILE_RE.exec(req.params.file);
  if (!match) return res.status(404).end();

  const username = match[1];
  res.type('image/jpeg');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(path.join(THUMBNAIL_DIR, `${username}.jpg`), (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

router.get('/site-logo', (req, res) => {
  const png = path.join(LOGO_DIR, 'site-logo.png');
  const jpg = path.join(LOGO_DIR, 'site-logo.jpg');
  const file = fs.existsSync(png) ? png : jpg;
  res.type(file.endsWith('.png') ? 'image/png' : 'image/jpeg');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  res.sendFile(file, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

module.exports = router;
