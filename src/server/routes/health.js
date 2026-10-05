'use strict';

const fs = require('fs');
const express = require('express');

function createHealthRouter({ config, db }) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    const ids = new Set(db.prepare('SELECT id FROM comics').all().map((row) => row.id));

    let total = 0;
    let orphans = 0;
    if (fs.existsSync(config.guidedViewDir)) {
      for (const file of fs.readdirSync(config.guidedViewDir)) {
        if (!file.endsWith('.json')) continue;
        total++;
        if (!ids.has(file.slice(0, -5))) orphans++;
      }
    }

    res.json({
      ok: true,
      config: {
        comicsNowRoot: config.comicsNowRoot,
        dbPath: config.dbPath,
        guidedViewDir: config.guidedViewDir,
        port: config.port,
        bind: config.bind
      },
      db: { comics: ids.size },
      sidecars: { total, orphans }
    });
  });

  return router;
}

module.exports = { createHealthRouter };
