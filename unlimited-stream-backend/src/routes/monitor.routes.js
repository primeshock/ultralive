const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const User = require('../models/User');
const MonitorLink = require('../models/MonitorLink');

const router = express.Router();

router.get('/monitor/:token', async (req, res) => {
  const link = await MonitorLink.findOne({ token: req.params.token, active: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
  if (!link) return res.status(404).send('لینک نامعتبر یا غیرفعال شده است.');
  const channel = await User.findOne({ username: link.channel }).select('username streamTitle isLive');
  if (!channel) return res.status(404).send('کانال پیدا نشد.');
  // JSON for now; a small frontend page (Phase B) calls this, then points an
  // HLS player at /api/monitor/:token/live.
  res.json({ channel: channel.username, streamTitle: channel.streamTitle, isLive: channel.isLive });
});

router.use(
  '/monitor/:token/live',
  async (req, res, next) => {
    const link = await MonitorLink.findOne({ token: req.params.token, active: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });
    if (!link) return res.status(404).end();
    req.monitorChannel = link.channel;
    next();
  },
  createProxyMiddleware({
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    // Express strips the mount prefix before this runs, so `path` is just
    // the remainder (e.g. "/index.m3u8") — rebuild the full path fresh.
    pathRewrite: (path, req) => `/live/${req.monitorChannel}${path}`,
  })
);

module.exports = router;
