'use strict';

const fs = require('fs');
const express = require('express');

function createHealthRouter({ config, db }) {
  const router = express.Router();
  const getComicsCount = db.prepare('SELECT COUNT(*) as count FROM comics');
  const checkComic = db.prepare('SELECT 1 FROM comics WHERE id = ?');

  router.get('/health', async (req, res, next) => {
    try {
      const dbComicsCount = getComicsCount.get().count;

      let total = 0;
      let orphans = 0;
      try {
        const files = await fs.promises.readdir(config.guidedViewDir);
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          total++;
          if (!checkComic.get(file.slice(0, -5))) orphans++;
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
        db: { comics: dbComicsCount },
        sidecars: { total, orphans }
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createHealthRouter };
