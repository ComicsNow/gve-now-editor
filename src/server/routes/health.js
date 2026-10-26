'use strict';

const fs = require('fs');
const express = require('express');

function createHealthRouter({ config, db }) {
  const router = express.Router();

  const countStmt = db.prepare('SELECT COUNT(*) as count FROM comics');

  router.get('/health', async (req, res, next) => {
    try {
      const comicsCount = countStmt.get().count;

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
            let validCount = 0;
            const BATCH_SIZE = 999;
            for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
                const batch = fileIds.slice(i, i + BATCH_SIZE);
                const placeholders = batch.map(() => '?').join(',');
                const stmt = db.prepare(`SELECT COUNT(id) as count FROM comics WHERE id IN (${placeholders})`);
                validCount += stmt.get(...batch).count;
            }
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
