const http = require('http');
const app = require('./app');
const { connectDb } = require('./config/db');
const { initChat } = require('./services/chat');
const { createMediaServer } = require('./services/mediaServer');
const { port, nodeEnv, jwtSecret, wpJoinSecret, roomSessionSecret } = require('./config/env');

async function main() {
  if (!jwtSecret || !wpJoinSecret || !roomSessionSecret) {
    throw new Error('Required secrets are missing. Configure JWT_SECRET, WP_JOIN_SECRET and ROOM_SESSION_SECRET.');
  }
  await connectDb();

  const httpServer = http.createServer(app);
  initChat(httpServer);

  const mediaServer = createMediaServer();
  mediaServer.run();

  httpServer.listen(port, () => {
    console.log(`[api] listening on :${port}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
