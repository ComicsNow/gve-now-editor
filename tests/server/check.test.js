'use strict';

const fs = require('fs');
const path = require('path');

const { buildCheckReport } = require('../../src/server/check');
const { createTestDb, insertComic } = require('../helpers/test-db');
const { tmpDir, rmrf } = require('../helpers/tmp');

function setup({ comics = [], sidecarFiles = [], makeDir = true } = {}) {
  const dir = tmpDir();
  const dbPath = path.join(dir, 'comics-now.db');
  const db = createTestDb(dbPath);
  for (const comic of comics) insertComic(db, comic);

  const guidedViewDir = path.join(dir, 'guided_view');
  if (makeDir) {
    fs.mkdirSync(guidedViewDir, { recursive: true });
    for (const name of sidecarFiles) fs.writeFileSync(path.join(guidedViewDir, name), '{}');
  }

  const config = {
    port: 3100,
    bind: '127.0.0.1',
    comicsNowRoot: dir,
    dbPath,
    guidedViewDir
  };
  return { dir, db, config };
}

describe('server/check buildCheckReport', () => {
  it('counts comics, completed rows and sidecar files without listening', () => {
    const { dir, db, config } = setup({
      comics: [
        { id: 'c1', guidedViewStatus: 'completed' },
        { id: 'c2', guidedViewStatus: 'pending' }
      ],
      sidecarFiles: ['c1.json', 'notes.txt']
    });
    try {
      const report = buildCheckReport({ config, db });
      expect(report.errors).toEqual([]);
      expect(report.db).toEqual({ ok: true, comics: 2, guidedCompleted: 1 });
      expect(report.sidecars.present).toBe(true);
      expect(report.sidecars.files).toBe(1); // notes.txt is not a sidecar
      expect(report.sidecars.orphans).toEqual([]);
      expect(report.sidecars.missing).toEqual([]);
      expect(report.config.port).toBe(3100);
      expect(report.config.dbPath).toBe(config.dbPath);
    } finally {
      db.close();
      rmrf(dir);
    }
  });

  it('reports orphaned sidecars (no comics row) and completed rows with no file', () => {
    const { dir, db, config } = setup({
      comics: [
        { id: 'c1', guidedViewStatus: 'completed' },
        { id: 'c3', guidedViewStatus: 'completed' }
      ],
      sidecarFiles: ['c1.json', 'deadbeef.json']
    });
    try {
      const report = buildCheckReport({ config, db });
      expect(report.sidecars.orphans).toEqual(['deadbeef.json']);
      expect(report.sidecars.missing).toEqual(['c3']);
    } finally {
      db.close();
      rmrf(dir);
    }
  });

  it('survives a missing guided view directory', () => {
    const { dir, db, config } = setup({ comics: [{ id: 'c1' }], makeDir: false });
    try {
      const report = buildCheckReport({ config, db });
      expect(report.errors).toEqual([]);
      expect(report.sidecars.present).toBe(false);
      expect(report.sidecars.files).toBe(0);
    } finally {
      db.close();
      rmrf(dir);
    }
  });

  it('reports a DB read failure instead of throwing', () => {
    const { dir, db, config } = setup({ comics: [{ id: 'c1' }] });
    db.close();
    try {
      const report = buildCheckReport({ config, db });
      expect(report.db.ok).toBe(false);
      expect(report.errors.join(' ')).toMatch(/database/i);
    } finally {
      rmrf(dir);
    }
  });
});
