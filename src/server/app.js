'use strict';

const path = require('path');
const express = require('express');
const { createHealthRouter } = require('./routes/health');
const { createComicsRouter } = require('./routes/comics');
const { createGuidedRouter } = require('./routes/guided');
const { createExportRouter } = require('./routes/exportRoute');
const { createImportRouter } = require('./routes/importRoutes');
const { createSettingsRouter } = require('./routes/settings');

const APP_VERSION = require('../../package.json').version;
const DEFAULT_PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

function createApp({ config, db, store, publicDir = DEFAULT_PUBLIC_DIR, configPath, env = process.env }) {
  const resolvedConfigPath =
    configPath || process.env.GVE_NOW_CONFIG || path.join(__dirname, '..', '..', 'config.json');

  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.static(publicDir));

  const deps = { config, db, store, appVersion: APP_VERSION };
  app.use('/api', createHealthRouter(deps));
  app.use('/api/comics', createComicsRouter(deps));
  app.use('/api/comics', createGuidedRouter(deps));
  app.use('/api/comics', createExportRouter(deps));
  app.use('/api/import', createImportRouter(deps));
  app.use('/api', createSettingsRouter({ config, configPath: resolvedConfigPath, env }));

  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON body' });
    console.error('[gve-now]', err);
    res.status(500).json({ error: err && err.message ? err.message : 'internal error' });
  });

  return app;
}

module.exports = { createApp };
