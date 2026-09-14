const express = require('express');
const path = require('path');

const router = express.Router();
const THUMBNAIL_DIR = path.join(process.cwd(), 'media', 'thumbnails');
const THUMBNAIL_FILE_RE = /^([a-z0-9_]{3,24})\.jpg$/;
const LOGO_DIR = path.join(process.cwd(), 'media');

// Served from our own app (has helmet -> X-Content-Type-Options: nosniff) instead of
// node-media-server's bare static folder, and we force the content type ourselves —
// so even if something ever got stored that wasn't actually a jpeg (it can't, see
// utils/upload.js's magic-byte check), a browser has no excuse to sniff and render it
// as anything other than an image.
router.get('/thumbnails/:file', (req, res) => {
  const match = THUMBNAIL_FILE_RE.exec(req.params.file);
  if (!match) return res.status(404).end();

  const username = match[1];
  res.type('image/jpeg');
  // helmet's default Cross-Origin-Resource-Policy is "same-origin", which makes
  // browsers block this image when embedded from a different origin (e.g. the
  // frontend on a different port/host) with net::ERR_BLOCKED_BY_RESPONSE. This is
  // a public thumbnail meant to be embedded cross-origin, so open just this route.
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(path.join(THUMBNAIL_DIR, `${username}.jpg`), (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

router.get('/site-logo', (req, res) => {
  res.type('image/jpeg');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(path.join(LOGO_DIR, 'site-logo.jpg'), (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

module.exports = router;
