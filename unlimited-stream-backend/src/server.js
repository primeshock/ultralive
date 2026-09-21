const http = require('http');
const app = require('./app');
const { connectDb } = require('./config/db');
const { initChat } = require('./services/chat');
const { createMediaServer } = require('./services/mediaServer');
const { startLiveStateSync } = require('./services/livekit');
const { startTelemetryCollector } = require('./services/telemetry');
const { backfillOrganizationIds, migrateLegacyOwnerRoles, migrateStudentIndexes } = require('./migrations/phase2');
const { port } = require('./config/env');

async function main() {
  await connectDb();
  await backfillOrganizationIds();
  await migrateStudentIndexes();
  await migrateLegacyOwnerRoles();
  startTelemetryCollector();

  const httpServer = http.createServer(app);
  initChat(httpServer);

  const mediaServer = createMediaServer();
  mediaServer.run();
  startLiveStateSync();

  httpServer.listen(port, () => {
    console.log(`[api] listening on :${port}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
