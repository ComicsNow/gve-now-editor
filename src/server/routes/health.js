'use strict';

const fs = require('fs');
const express = require('express');

function createHealthRouter({ config, db }) {
  const router = express.Router();

  const countStmt = db.prepare('SELECT COUNT(id) FROM comics').pluck();
  const checkStmt = db.prepare('SELECT 1 FROM comics WHERE id = ?').pluck();

  router.get('/health', (req, res) => {
    const comicsCount = countStmt.get();

    let total = 0;
    let orphans = 0;
    if (fs.existsSync(config.guidedViewDir)) {
      for (const file of fs.readdirSync(config.guidedViewDir)) {
        if (!file.endsWith('.json')) continue;
        total++;
        const id = file.slice(0, -5);
        if (!checkStmt.get(id)) orphans++;
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
      db: { comics: comicsCount },
      sidecars: { total, orphans }
    });
  });

  return router;
}

module.exports = { createHealthRouter };
