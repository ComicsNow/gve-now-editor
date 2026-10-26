'use strict';

const fs = require('fs');
const express = require('express');

function createHealthRouter({ config, db }) {
  const router = express.Router();

  const countStmt = db.prepare('SELECT COUNT(*) FROM comics').pluck();
  const checkStmt = db.prepare(`
    SELECT count(comics.id)
    FROM json_each(?) as j
    JOIN comics ON comics.id = j.value
  `).pluck();

  router.get('/health', async (req, res, next) => {
    try {
      const comicsCount = countStmt.get();

      let total = 0;
      let orphans = 0;
      try {
        const files = await fs.promises.readdir(config.guidedViewDir);
        const fileIds = [];

        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          total++;
          fileIds.push(file.slice(0, -5));
        }

        if (fileIds.length > 0) {
          const validCount = checkStmt.get(JSON.stringify(fileIds));
          orphans = total - validCount;
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
        db: { comics: comicsCount },
        sidecars: { total, orphans }
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createHealthRouter };
