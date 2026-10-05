const fs = require('fs');
const path = require('path');
const { createSidecarStore } = require('../../src/server/sidecar-store');
const { tmpDir, rmrf } = require('../helpers/tmp');

describe('server/sidecar-store', () => {
  let dir;
  let guidedViewDir;
  let backupDir;
  let store;

  const fixedClock = () => new Date('2026-10-04T12:34:56.789Z');

  beforeEach(() => {
    dir = tmpDir();
    guidedViewDir = path.join(dir, 'guided_view');
    backupDir = path.join(guidedViewDir, '.backups');
    store = createSidecarStore({ guidedViewDir, backupDir, now: fixedClock });
  });
  afterEach(() => rmrf(dir));

  it('write creates the directory and a canonical 2-space JSON file with no temp leftovers', () => {
    const ok = store.write('c1', { comicId: 'c1', type: 'western', pages: {} });
    expect(ok).toBe(true);
    const target = path.join(guidedViewDir, 'c1.json');
    expect(fs.readFileSync(target, 'utf8')).toBe('{\n  "comicId": "c1",\n  "type": "western",\n  "pages": {}\n}\n');
    expect(fs.readdirSync(guidedViewDir)).toEqual(['c1.json']);
  });

  it('read returns parsed JSON, null for a missing file, and throws on corruption', () => {
    expect(store.read('missing')).toBeNull();
    store.write('c1', { a: 1 });
    expect(store.read('c1')).toEqual({ a: 1 });
    fs.writeFileSync(path.join(guidedViewDir, 'bad.json'), '{oops');
    expect(() => store.read('bad')).toThrow(/invalid json/i);
  });

  it('backup copies the current file under the comic id with a timestamped name', () => {
    expect(store.backup('c1')).toBeNull();
    store.write('c1', { v: 1 });
    const first = store.backup('c1');
    expect(first).toBe(path.join(backupDir, 'c1', '20261004T123456789.json'));
    expect(JSON.parse(fs.readFileSync(first, 'utf8'))).toEqual({ v: 1 });

    // Same clock again: must never overwrite an existing backup.
    const second = store.backup('c1');
    expect(second).not.toBe(first);
    expect(fs.readdirSync(path.join(backupDir, 'c1')).length).toBe(2);
  });

  it('pruneBackups keeps the newest N and removes the rest', () => {
    for (let i = 0; i < 25; i++) {
      store.write('c1', { v: i });
      store.backup('c1');
    }
    const before = fs.readdirSync(path.join(backupDir, 'c1'));
    expect(before.length).toBe(25);

    const pruned = store.pruneBackups('c1', 20);
    expect(pruned).toBe(5);
    const after = fs.readdirSync(path.join(backupDir, 'c1'));
    expect(after.length).toBe(20);
    expect(after).not.toContain('20261004T123456789.json'); // oldest, first written
  });

  it('a failing write leaves no temp files behind', () => {
    const circular = {};
    circular.self = circular;
    expect(() => store.write('c1', circular)).toThrow();
    expect(fs.existsSync(guidedViewDir) ? fs.readdirSync(guidedViewDir) : []).toEqual([]);
  });
});
