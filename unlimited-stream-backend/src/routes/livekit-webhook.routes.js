const express = require('express');
const { WebhookReceiver } = require('livekit-server-sdk');
const { livekitApiKey, livekitApiSecret } = require('../config/env');
const { handleWebhook } = require('../services/livekit');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const receiver = new WebhookReceiver(livekitApiKey, livekitApiSecret);
    // req.body must be the raw Buffer/string here — see the express.raw()
    // middleware applied to this route's mount point in app.js. Signature
    // verification fails silently (wrong secret error) if JSON-parsed first.
    const event = await receiver.receive(req.body, req.get('Authorization'));
    await handleWebhook(event);
    res.json({ ok: true });
  } catch (err) {
    console.error('[livekit webhook]', err.message);
    res.status(401).json({ error: 'Invalid webhook' });
  }
});

module.exports = router;
