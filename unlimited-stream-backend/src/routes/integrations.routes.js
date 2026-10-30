const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const ApiKey = require('../models/ApiKey');
const WebhookEndpoint = require('../models/WebhookEndpoint');
const { EVENTS } = require('../services/webhooks');
const { organizationFilter, isSuperOwner } = require('../utils/organizationScope');

const router = express.Router();
router.use(requireAuth, requireRole('SUPER_OWNER', 'owner', 'ORGANIZATION_OWNER', 'ADMIN_L1'));

const scope = (req) => (isSuperOwner(req.user) ? { organizationId: req.organizationContext?._id || null } : { organizationId: req.user.organizationId });
const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

router.get('/', async (req, res) => {
  const [keys, hooks] = await Promise.all([
    ApiKey.find({ ...scope(req), revoked: false }).select('name prefix lastUsedAt createdAt').sort({ createdAt: -1 }),
    WebhookEndpoint.find(scope(req)).select('url events active lastStatus lastDeliveryAt createdAt').sort({ createdAt: -1 }),
  ]);
  res.json({ keys, webhooks: hooks, events: EVENTS });
});

router.post('/keys', async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'نام کلید لازم است.' });
  const key = `ulk_${crypto.randomBytes(24).toString('hex')}`;
  const doc = await ApiKey.create({ name, prefix: key.slice(0, 8), hash: hashKey(key), createdBy: req.user._id, ...scope(req) });
  res.status(201).json({ id: doc._id, name, key, note: 'این کلید فقط همین یک بار نمایش داده می‌شود.' });
});

router.delete('/keys/:id', async (req, res) => {
  await ApiKey.updateOne({ _id: req.params.id, ...scope(req) }, { revoked: true });
  res.status(204).end();
});

router.post('/webhooks', async (req, res) => {
  let url;
  try { url = new URL(String(req.body?.url || '')); } catch { return res.status(400).json({ error: 'آدرس نامعتبر است.' }); }
  if (!['https:', 'http:'].includes(url.protocol)) return res.status(400).json({ error: 'آدرس باید http یا https باشد.' });
  const events = Array.isArray(req.body?.events) && req.body.events.length ? req.body.events.filter((e) => EVENTS.includes(e)) : ['*'];
  const secret = crypto.randomBytes(24).toString('hex');
  const doc = await WebhookEndpoint.create({ url: url.toString(), secret, events: events.length ? events : ['*'], createdBy: req.user._id, ...scope(req) });
  res.status(201).json({ id: doc._id, url: doc.url, events: doc.events, secret, note: 'راز امضا فقط همین یک بار نمایش داده می‌شود (HMAC-SHA256 در هدر X-UltraLive-Signature).' });
});

router.delete('/webhooks/:id', async (req, res) => {
  await WebhookEndpoint.deleteOne({ _id: req.params.id, ...scope(req) });
  res.status(204).end();
});

module.exports = router;
