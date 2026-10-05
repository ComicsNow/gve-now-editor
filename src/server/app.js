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

function isAllowedHost(hostHeader, { config, env = process.env } = {}) {
  if (!hostHeader) return false;
  let hostname;
  if (hostHeader.startsWith('[')) {
    const closing = hostHeader.indexOf(']');
    hostname = closing !== -1 ? hostHeader.slice(0, closing + 1) : hostHeader;
  } else {
    hostname = hostHeader.split(':')[0];
  }
  hostname = hostname.toLowerCase();

  const allowed = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (config && config.bind && config.bind !== '0.0.0.0' && config.bind !== '::') {
    allowed.add(config.bind);
  }
  const custom = (env.GVE_NOW_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const h of custom) allowed.add(h);

  if (allowed.has('*') || allowed.has(hostname)) return true;

  const allowRemote = env.GVE_NOW_ALLOW_REMOTE === '1' || (config && config.bind === '0.0.0.0');
  if (allowRemote) {
    const isIpOrLocal = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.startsWith('[') || hostname.endsWith('.local');
    if (isIpOrLocal) return true;
  }

  return false;
}

function createApp({ config, db, store, publicDir = DEFAULT_PUBLIC_DIR, configPath, env = process.env }) {
  const resolvedConfigPath =
    configPath || process.env.GVE_NOW_CONFIG || path.join(__dirname, '..', '..', 'config.json');

  const app = express();
  app.use((req, res, next) => {
    if (!isAllowedHost(req.headers.host, { config, env })) {
      return res.status(403).json({ error: `untrusted or forbidden host header: ${req.headers.host || 'none'}` });
    }
    next();
  });
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

module.exports = { createApp, isAllowedHost };
