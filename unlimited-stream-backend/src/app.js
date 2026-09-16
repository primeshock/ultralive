const express = require('express');
require('express-async-errors');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const streamRoutes = require('./routes/stream.routes');
const mediaRoutes = require('./routes/media.routes');
const masterRoutes = require('./routes/master.routes');
const adminRoutes = require('./routes/admin.routes');
const sessionRoutes = require('./routes/session.routes');
const pollVoteRoutes = require('./routes/pollVote.routes');
const monitorRoutes = require('./routes/monitor.routes');
const liveRoutes = require('./routes/live.routes');
const livekitRoutes = require('./routes/livekit.routes');
const livekitWebhookRoutes = require('./routes/livekit-webhook.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { corsOrigin } = require('./config/env');

const app = express();

// Behind Nginx (see install.sh), every request otherwise looks like it comes from
// 127.0.0.1 — express-rate-limit (and anything else keyed on req.ip) would then
// treat every visitor as the same client, sharing one bucket. `1` means "trust
// exactly one proxy hop", matching Nginx running on the same host.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
// LiveKit signs its webhook over the RAW request body (application/webhook+json,
// not application/json) — express.json() below only ever touches
// application/json bodies and leaves this one alone, but this route is kept
// explicit and right after cors/helmet so nothing else can ever intercept the
// stream first.
app.use('/api/livekit/webhook', express.raw({ type: () => true, limit: '1mb' }), livekitWebhookRoutes);
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/site', async (_req, res) => {
  const settings = await require('./models/SiteSettings').get();
  res.json({
    siteName: settings.siteName || 'Koosha Live',
    browserTabTitle: settings.browserTabTitle || settings.siteName || 'Koosha Live',
    logoUrl: settings.logoUrl || '',
    faviconUrl: settings.faviconUrl || '',
  });
});
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/rooms', pollVoteRoutes); // -> /api/rooms/:channel/polls/...
app.use('/api', monitorRoutes); // -> /api/monitor/:token, /api/monitor/:token/live
// Mounted at root to match Nginx's /live/ location (see PHASE_A.md for the
// required Nginx change — it must point here now, not straight at :8000).
app.use(liveRoutes); // -> /live/:channel
app.use('/api/livekit', livekitRoutes);
app.use(mediaRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
