// node-media-server@2.7.4 has a bug: node_trans_server.js logs a `version`
// variable it never declares, throwing ReferenceError on every startup when
// a `trans` (HLS) config is present. Upstream is unmaintained, so we patch
// the installed file in place after each `npm install`.
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '..',
  'node_modules',
  'node-media-server',
  'src',
  'node_trans_server.js'
);

if (!fs.existsSync(file)) {
  process.exit(0);
}

const src = fs.readFileSync(file, 'utf8');
// getFFmpegVersion is imported but was never actually implemented/exported
// by this package version, so we can't call it — just stub the value out.
const marker = "let version = 'n/a';";

if (src.includes(marker)) {
  process.exit(0); // already patched
}

const needle = "context.nodeEvent.on('donePublish', this.onDonePublish.bind(this));";
if (!src.includes(needle)) {
  console.warn('[fix-node-media-server] expected code not found, skipping patch');
  process.exit(0);
}

const patched = src.replace(needle, `${needle}\n    ${marker}`);
fs.writeFileSync(file, patched);
console.log('[fix-node-media-server] patched undefined `version` bug in node-media-server');
