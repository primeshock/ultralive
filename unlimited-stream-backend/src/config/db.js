const mongoose = require('mongoose');
const { mongoUri } = require('./env');

async function connectDb() {
  mongoose.connection.on('connected', () => console.log('[db] connected'));
  mongoose.connection.on('error', (err) => console.error('[db] error', err));
  await mongoose.connect(mongoUri);
}

module.exports = { connectDb };
