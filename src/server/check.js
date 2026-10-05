'use strict';

const fs = require('fs');

// Read-only preflight report for `bin/gve-now.js check`: resolved config,
// DB census, sidecar census. Never listens, never writes.
function buildCheckReport({ config, db }) {
  const errors = [];
  let ok = true;
  let comics = 0;
  let guidedCompleted = 0;
  const dbIds = new Set();
  const completedIds = new Set();
  try {
    comics = db.prepare('SELECT COUNT(*) AS n FROM comics').get().n;
    for (const row of db.prepare(`SELECT id, guidedViewStatus FROM comics`).iterate()) {
      dbIds.add(row.id);
      if (row.guidedViewStatus === 'completed') completedIds.add(row.id);
    }
    guidedCompleted = completedIds.size;
  } catch (err) {
    ok = false;
    errors.push(`database read failed: ${err.message}`);
  }

  let present = true;
  let files = [];
  try {
    files = fs.readdirSync(config.guidedViewDir).filter((f) => f.endsWith('.json'));
  } catch {
    present = false; // dir not created yet — comics-now creates it on first detection
  }

  const orphans = [];
  const seen = new Set();
  for (const file of files) {
    const id = file.slice(0, -'.json'.length);
    seen.add(id);
    if (!dbIds.has(id)) orphans.push(file);
  }
  const missing = [...completedIds].filter((id) => !seen.has(id)).map((id) => id);

  return {
    config: {
      port: config.port,
      bind: config.bind,
      comicsNowRoot: config.comicsNowRoot,
      dbPath: config.dbPath,
      guidedViewDir: config.guidedViewDir
    },
    db: { ok, comics, guidedCompleted },
    sidecars: { present, files: files.length, orphans, missing },
    errors
  };
}

module.exports = { buildCheckReport };
