const express = require('express');
const { WebhookReceiver } = require('livekit-server-sdk');
const { livekitApiKey, livekitApiSecret } = require('../config/env');
const { handleWebhook } = require('../services/livekit');

const router = express.Router();

function authToken(header) {
  const value = String(header || '').trim();
  return value.replace(/^Bearer\s+/i, '');
}

router.post('/', async (req, res) => {
  const authorization = req.get('Authorization') || req.get('authorization') || '';
  try {
    const receiver = new WebhookReceiver(livekitApiKey, livekitApiSecret);
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    if (!raw.length) {
      console.warn('[livekit webhook] empty body', { hasAuthorization: Boolean(authorization) });
      return res.status(400).json({ error: 'Empty webhook' });
    }
    const event = await receiver.receive(raw, authToken(authorization) || authorization);
    await handleWebhook(event);
    res.json({ ok: true });
  } catch (err) {
    console.error('[livekit webhook]', {
      error: err.message,
      hasAuthorization: Boolean(authorization),
      contentType: req.get('Content-Type') || null,
      bodyBytes: Buffer.isBuffer(req.body) ? req.body.length : 0,
    });
    res.status(401).json({ error: 'Invalid webhook' });
  }
});

module.exports = router;
