module.exports = {
  apps: [
    {
      name: 'unlimited-stream-backend',
      cwd: '/opt/unlimited-stream/unlimited-stream-backend',
      script: 'src/server.js',
    },
    {
      name: 'unlimited-stream-frontend',
      cwd: '/opt/unlimited-stream/unlimited-stream-front',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      min_uptime: '30s',
      max_restarts: 5,
      exp_backoff_restart_delay: 1000,
    },
  ],
};
