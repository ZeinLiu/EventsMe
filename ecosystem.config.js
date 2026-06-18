module.exports = {
  apps: [
    {
      name:          'eventsme-local-sync',
      script:        './scripts/local-sync.js',
      cwd:           __dirname,
      interpreter:   'node',

      // Run every Sunday at 9am — adjust to taste
      // Cron syntax: minute hour day-of-month month day-of-week
      cron_restart:  '0 9 * * 0',
      autorestart:   false,   // don't restart on exit — only on cron
      watch:         false,

      // pm2 logs to ~/.pm2/logs/ by default
      // Override here if you want them in the repo:
      // out_file:   './logs/local-sync.log',
      // error_file: './logs/local-sync-error.log',
      time: true,   // prefix log lines with timestamp
    },

    // ── Add future local sources here ─────────────────────────
    // Example: a second job running on a different schedule
    // {
    //   name:        'eventsme-grab-sync',
    //   script:      './scripts/local-sync.js',
    //   args:        '--type grab',
    //   cron_restart:'0 10 * * 3',  // Wednesdays at 10am
    //   autorestart: false,
    //   watch:       false,
    //   time:        true,
    // },
  ],
}
