const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const THUMBNAIL_DIR = path.join(process.cwd(), 'media', 'thumbnails');
const THUMBNAIL_FILE_RE = /^([a-z0-9_]{3,24})\.jpg$/;
const LOGO_DIR = path.join(process.cwd(), 'media');
const ORGANIZATION_LOGO_RE = /^[a-f0-9]{24}\.png$/;

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

router.get('/site-favicon', (req, res) => {
  const png = path.join(LOGO_DIR, 'site-favicon.png');
  if (!fs.existsSync(png)) return res.status(404).end();
  res.type('image/png');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  res.sendFile(png, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

router.get('/site-background', (req, res) => {
  const file = path.join(LOGO_DIR, 'site-background.png');
  if (!fs.existsSync(file)) return res.status(404).end();
  res.type('image/png');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
  res.sendFile(file, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

router.get('/organization-logos/:file', (req, res) => {
  if (!ORGANIZATION_LOGO_RE.test(req.params.file)) return res.status(404).end();
  const file = path.join(process.cwd(), 'media', 'organizations', req.params.file);
  res.type('image/png');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(file, (err) => { if (err && !res.headersSent) res.status(404).end(); });
});

module.exports = router;
