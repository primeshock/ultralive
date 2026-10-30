const path = require('path');

module.exports = {
  apps: [
    {
      name: 'unlimited-stream-backend',
      cwd: path.join(__dirname, 'unlimited-stream-backend'),
      script: 'src/server.js',
      max_memory_restart: '1G',
    },
    {
      name: 'unlimited-stream-frontend',
      cwd: path.join(__dirname, 'unlimited-stream-front'),
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      max_memory_restart: '1G',
    },
  ],
};
