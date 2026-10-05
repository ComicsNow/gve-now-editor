'use strict';

const fs = require('fs');
const path = require('path');

// Sidecar file access: atomic writes (temp + rename), timestamped backups in a
// hidden dir comics-now never scans, retention pruning.
function createSidecarStore({ guidedViewDir, backupDir, now = () => new Date() }) {
  function pathFor(comicId) {
    return path.join(guidedViewDir, `${comicId}.json`);
  }

  function read(comicId) {
    const file = pathFor(comicId);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`invalid JSON in sidecar ${file}: ${err.message}`);
    }
  }

  function write(comicId, obj) {
    const json = JSON.stringify(obj, null, 2) + '\n'; // throws on circular before touching disk
    fs.mkdirSync(guidedViewDir, { recursive: true });
    const tmp = path.join(guidedViewDir, `.tmp-${comicId}-${process.pid}-${Math.random().toString(36).slice(2)}`);
    try {
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, pathFor(comicId));
    } catch (err) {
      try {
        fs.unlinkSync(tmp);
      } catch {}
      throw err;
    }
    return true;
  }

  function backup(comicId) {
    const src = pathFor(comicId);
    if (!fs.existsSync(src)) return null;
    const dir = path.join(backupDir, comicId);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = now().toISOString().replace(/[-:.]/g, '').replace('Z', '');
    let name = `${stamp}.json`;
    let counter = 1;
    while (fs.existsSync(path.join(dir, name))) {
      counter++;
      name = `${stamp}-${counter}.json`;
    }
    fs.copyFileSync(src, path.join(dir, name));
    return path.join(dir, name);
  }

  function backupSortKey(name) {
    const m = name.match(/^(\d{8}T\d{9})(?:-(\d+))?\.json$/);
    return m ? [m[1], m[2] ? Number(m[2]) : 1] : ['', 0];
  }

  function pruneBackups(comicId, keep = 20) {
    const dir = path.join(backupDir, comicId);
    if (!fs.existsSync(dir)) return 0;
    const names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort((a, b) => {
      const [ta, ca] = backupSortKey(a);
      const [tb, cb] = backupSortKey(b);
      return ta < tb ? -1 : ta > tb ? 1 : ca - cb;
    });
    let pruned = 0;
    for (const name of names.slice(0, Math.max(0, names.length - keep))) {
      fs.unlinkSync(path.join(dir, name));
      pruned++;
    }
    return pruned;
  }

  return { pathFor, read, write, backup, pruneBackups };
}

module.exports = { createSidecarStore };
