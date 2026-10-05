const path = require('path');
const { openDatabase, markGuidedViewComplete } = require('../../src/server/db');
const { createTestDb, insertComic } = require('../helpers/test-db');
const { tmpDir, rmrf } = require('../helpers/tmp');

describe('server/db', () => {
  let dir;
  let dbPath;

  beforeEach(() => {
    dir = tmpDir();
    dbPath = path.join(dir, 'comics-now.db');
    const seed = createTestDb(dbPath);
    seed.close();
  });
  afterEach(() => rmrf(dir));

  it('markGuidedViewComplete sets status/path, clears error, and never touches updatedAt', () => {
    const db = openDatabase(dbPath);
    insertComic(db, { id: 'c1', guidedViewStatus: 'failed', guidedViewError: 'boom', updatedAt: 12345 });

    markGuidedViewComplete(db, 'c1', '/gw/c1.json');

    const row = db.prepare('SELECT * FROM comics WHERE id = ?').get('c1');
    expect(row.guidedViewStatus).toBe('completed');
    expect(row.guidedViewError).toBeNull();
    expect(row.guidedViewPath).toBe('/gw/c1.json');
    expect(row.updatedAt).toBe(12345);
    db.close();
  });

  it('throws when the comic does not exist', () => {
    const db = openDatabase(dbPath);
    expect(() => markGuidedViewComplete(db, 'nope', '/gw/x.json')).toThrow(/not found/i);
    db.close();
  });

  it('readonly handles can read but not write', () => {
    const rw = openDatabase(dbPath);
    insertComic(rw, { id: 'c1' });
    rw.close();

    const ro = openDatabase(dbPath, { readonly: true });
    expect(ro.prepare('SELECT id FROM comics').all()).toEqual([{ id: 'c1' }]);
    expect(() => ro.prepare('UPDATE comics SET guidedViewStatus = ?').run('completed')).toThrow(/read-?only/i);
    ro.close();
  });

  it('fails with a busy error while another connection holds a write lock, then succeeds', () => {
    const seeder = openDatabase(dbPath);
    insertComic(seeder, { id: 'c1' });
    seeder.close();

    const holder = openDatabase(dbPath);
    holder.prepare('BEGIN IMMEDIATE').run();
    holder.prepare('UPDATE comics SET tagStatus = ? WHERE id = ?').run('scanning', 'c1');

    const writer = openDatabase(dbPath, { busyTimeout: 30 });
    expect(() => markGuidedViewComplete(writer, 'c1', '/gw/c1.json', { retries: 2, delayMs: 10 })).toThrow(/busy|locked/i);

    holder.prepare('ROLLBACK').run();
    holder.close();

    expect(markGuidedViewComplete(writer, 'c1', '/gw/c1.json', { retries: 2, delayMs: 10 })).toBe(true);
    expect(writer.prepare('SELECT guidedViewStatus FROM comics WHERE id = ?').get('c1').guidedViewStatus).toBe('completed');
    writer.close();
  });
});
