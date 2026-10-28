'use strict';

const fs = require('fs');
const express = require('express');

function createHealthRouter({ config, db }) {
  const router = express.Router();
  // ⚡ Bolt: Pre-compile statement and use .pluck() to avoid re-parsing SQL and skip intermediate object allocation.
  const getComicIds = db.prepare('SELECT id FROM comics').pluck();

  router.get('/health', async (req, res, next) => {
    try {
      const ids = new Set(getComicIds.all());

      let total = 0;
      let orphans = 0;
      try {
        const files = await fs.promises.readdir(config.guidedViewDir);
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          total++;
          if (!ids.has(file.slice(0, -5))) orphans++;
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
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
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createHealthRouter };
