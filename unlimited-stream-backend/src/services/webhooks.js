const crypto = require('crypto');
const WebhookEndpoint = require('../models/WebhookEndpoint');

const EVENTS = ['class.started', 'class.ended', 'student.joined', 'student.left', 'recording.ready'];

async function deliver(endpoint, body, attempt = 0) {
  const signature = crypto.createHmac('sha256', endpoint.secret).update(body).digest('hex');
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-UltraLive-Signature': `sha256=${signature}`, 'User-Agent': 'UltraLive-Webhook/1' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    await WebhookEndpoint.updateOne({ _id: endpoint._id }, { lastStatus: res.status, lastDeliveryAt: new Date() });
    if (res.status >= 500 && attempt < 2) setTimeout(() => deliver(endpoint, body, attempt + 1), 5000 * (attempt + 1));
  } catch {
    await WebhookEndpoint.updateOne({ _id: endpoint._id }, { lastStatus: 0, lastDeliveryAt: new Date() }).catch(() => {});
    if (attempt < 2) setTimeout(() => deliver(endpoint, body, attempt + 1), 5000 * (attempt + 1));
  }
}

// Fire-and-forget: never blocks or breaks the LiveKit webhook path.
function emit(organizationId, event, data) {
  (async () => {
    const endpoints = await WebhookEndpoint.find({ active: true, organizationId: organizationId || null, $or: [{ events: '*' }, { events: event }] });
    if (!endpoints.length) return;
    const body = JSON.stringify({ event, at: new Date().toISOString(), data });
    endpoints.forEach((endpoint) => deliver(endpoint, body));
  })().catch((err) => console.warn('[webhooks]', err.message));
}

module.exports = { emit, EVENTS };
