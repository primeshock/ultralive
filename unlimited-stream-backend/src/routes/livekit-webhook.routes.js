const express = require('express');
const { WebhookReceiver } = require('livekit-server-sdk');
const { livekitApiKey, livekitApiSecret } = require('../config/env');
const { handleWebhook } = require('../services/livekit');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const receiver = new WebhookReceiver(livekitApiKey, livekitApiSecret);
    const event = await receiver.receive(req.body, req.get('Authorization'));
    await handleWebhook(event);
    res.json({ ok: true });
  } catch (err) {
    console.error('[livekit webhook]', err.message);
    res.status(401).json({ error: 'Invalid webhook' });
  }
});

module.exports = router;
