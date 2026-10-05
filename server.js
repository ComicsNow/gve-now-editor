'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { loadConfig, validateConfig } = require('./src/server/config');
const { openDatabase } = require('./src/server/db');
const { createSidecarStore } = require('./src/server/sidecar-store');
const { createApp } = require('./src/server/app');
const { listen } = require('./src/server/listen');

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

function main() {
  const configPath = process.env.GVE_NOW_CONFIG || path.join(__dirname, 'config.json');
  const config = loadConfig({ configPath });

  // This app has no auth and can rewrite reader content; never expose it.
  if (!LOOPBACK.has(config.bind) && process.env.GVE_NOW_ALLOW_REMOTE !== '1') {
    console.error(
      `refusing to bind ${config.bind}: GVE Now! has no auth. Use a loopback bind or set GVE_NOW_ALLOW_REMOTE=1 if you really mean it.`
    );
    process.exit(1);
  }

  if (!fs.existsSync(path.join(__dirname, 'public', 'app.js'))) {
    console.warn('warning: public/app.js not found — run `npm run build:web` or the web UI will be blank');
  }

  const { errors, warnings } = validateConfig(config);
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`error: ${error}`);
    process.exit(1);
  }

  const db = openDatabase(config.dbPath, { busyTimeout: 5000 });
  const store = createSidecarStore(config);
  const app = createApp({ config, db, store, configPath, env: process.env });
  const server = http.createServer(app);

  listen(server, { port: config.port, bind: config.bind })
    .then(({ port }) => {
      console.log(`GVE Now! listening on http://${config.bind}:${port}`);
      console.log(`  comics-now root: ${config.comicsNowRoot}`);
      console.log(`  database:        ${config.dbPath}`);
      console.log(`  guided view dir: ${config.guidedViewDir}`);
    })
    .catch((err) => {
      console.error(`failed to listen: ${err.message}`);
      process.exit(1);
    });

  const shutdown = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
