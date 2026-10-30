const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { canAccessClass } = require('../utils/classAccess');

const router = express.Router();

// Replaces Nginx's direct proxy_pass to :8000 for /live/ (see PHASE_A.md for
// the required Nginx change). A request gets through if EITHER it carries a
// valid real-account login cookie (teacher/admin/owner — same cookie the
// rest of the API uses) OR a valid student room-session cookie scoped to
// this exact channel. Everyone else is rejected before anything reaches the
// media server.
router.use('/live/:channel', async (req, res, next) => {
  const channel = req.params.channel.toLowerCase();
  if (await canAccessClass(channel, req.cookies || {})) return next();
  return res.status(401).send('برای مشاهده این کلاس باید از طریق سایت اصلی وارد شوید.');
});

router.use(
  '/live/:channel',
  createProxyMiddleware({
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    pathRewrite: (path, req) => `/live/${req.params.channel}${path}`,
  })
);

module.exports = router;
