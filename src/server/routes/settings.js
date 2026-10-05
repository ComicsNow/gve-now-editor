'use strict';

const express = require('express');
const { previewConfig, readConfigFile, rehomeRoot, resolveConfig, saveConfig, validateConfig } = require('../config');

const RESTART_MESSAGE = 'Restart GVE Now! to apply (sudo systemctl restart gve-now)';

function createSettingsRouter({ config, configPath, env = process.env }) {
  const router = express.Router();

  const resolvedSettings = (resolved) => ({
    comicsNowRoot: resolved.comicsNowRoot,
    dbPath: resolved.dbPath,
    guidedViewDir: resolved.guidedViewDir,
    backupDir: resolved.backupDir,
    pageCacheDir: resolved.pageCacheDir,
    port: resolved.port,
    bind: resolved.bind
  });

  const envFlags = () => ({
    comicsNowRoot: Boolean(env.COMICS_NOW_ROOT),
    port: Boolean(env.GVE_NOW_PORT),
    bind: Boolean(env.GVE_NOW_BIND)
  });

  router.get('/settings', (req, res) => {
    const validation = validateConfig(config);
    res.json({
      ok: true,
      configPath,
      settings: resolvedSettings(config),
      env: envFlags(),
      validation: { errors: validation.errors, warnings: validation.warnings }
    });
  });

  router.put('/settings', (req, res) => {
    const raw = req.body && req.body.comicsNowRoot;
    if (typeof raw !== 'string' || !raw.trim()) {
      return res.status(400).json({
        ok: false,
        errors: ['comicsNowRoot must be a non-empty path to the comics-now install']
      });
    }
    const comicsNowRoot = raw.trim();

    let candidate;
    let saveOptions = {};
    let droppedKeys = [];
    if (env.COMICS_NOW_ROOT) {
      // The env var owns the effective root; saving the file is only a hint
      // for when it goes away, so don't touch the file's other path keys.
      candidate = previewConfig({ configPath, env, changes: { comicsNowRoot } });
    } else {
      // A root change must not leave path pins from the old root behind: pins
      // that repeat the old root's derivation are stale (drop them so the new
      // root re-derives them); pins that are genuinely custom would split the
      // app between two roots (reject and let the operator resolve by hand).
      const rehomed = rehomeRoot(readConfigFile(configPath), comicsNowRoot);
      if (rehomed.conflicts.length) {
        return res.status(400).json({
          ok: false,
          errors: rehomed.conflicts.map(
            ({ key, value }) =>
              `config.json pins ${key} to ${value}; remove the pin (or edit it by hand) before changing the comics-now root`
          )
        });
      }
      candidate = resolveConfig(rehomed.file, env);
      saveOptions = { removeKeys: rehomed.dropped };
      droppedKeys = rehomed.dropped;
    }

    // Validate the candidate config exactly as the app would boot with it;
    // only a config with no errors is written to disk.
    const validation = validateConfig(candidate);
    if (validation.errors.length) {
      return res.status(400).json({ ok: false, errors: validation.errors, warnings: validation.warnings });
    }

    saveConfig({ comicsNowRoot }, { configPath, ...saveOptions });

    const warnings = [...validation.warnings];
    if (droppedKeys.length) {
      warnings.push(
        `dropped stale path keys from config.json (${droppedKeys.join(', ')}) — they now derive from the new comics-now root`
      );
    }
    if (env.COMICS_NOW_ROOT) {
      warnings.push(
        `COMICS_NOW_ROOT is set in the service environment and overrides config.json; ` +
          `the running app keeps using ${config.comicsNowRoot} until it is unset`
      );
    }

    res.json({
      ok: true,
      configPath,
      restartRequired: true,
      message: RESTART_MESSAGE,
      settings: resolvedSettings(candidate),
      warnings
    });
  });

  return router;
}

module.exports = { createSettingsRouter };
