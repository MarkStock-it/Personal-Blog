/**
 * pm2 definition for the host (matches the other apps in this account: fork mode, explicit cwd).
 *
 * `--env-file=.env` is Node's own .env support (Node 20.6+), so the app needs no dotenv dependency
 * and the credentials stay in a single 600-permission file that is never committed.
 *
 *   pm2 start ecosystem.config.cjs && pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'elyplog',
      script: 'src/server.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production' },
      /* Logs deliberately use pm2's own defaults (~/.pm2/logs/elyplog-*.log), like the other apps in
         this account. ~/logs is a root-owned symlink to /data/web/logs/<user>, which is not writable
         here, and pointing pm2 at it made the process fail to launch with EACCES. */
      time: true,
    },
  ],
};
