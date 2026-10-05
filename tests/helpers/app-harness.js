'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const { loadConfig } = require('../../src/server/config');
const { openDatabase } = require('../../src/server/db');
const { createSidecarStore } = require('../../src/server/sidecar-store');
const { createApp } = require('../../src/server/app');
const { createTestDb, insertComic, insertPref } = require('./test-db');
const { makeCbz } = require('./make-cbz');
const { tmpDir, rmrf } = require('./tmp');

// 1x1 image bytes (verified fixtures).
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPG_1PX = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');

// `env` is the environment the app sees (object, or a function of {dir, root}
// when it must reference the temp root). loadConfig always gets
// COMICS_NOW_ROOT=root so the harness targets its temp install; a config.json
// is seeded in the temp dir so settings writes have a real file to land in.
async function startHarness({ comics = [], prefs = [], sidecars = {}, cbzPages = {}, configOverrides = {}, configFile, env } = {}) {
  const dir = tmpDir();
  const root = path.join(dir, 'comics-now');
  fs.mkdirSync(root, { recursive: true });

  const configPath = path.join(dir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ comicsNowRoot: root, ...configFile }, null, 2));
  const appEnv = typeof env === 'function' ? env({ dir, root }) : env || {};

  const dbPath = path.join(root, 'comics-now.db');
  const db = createTestDb(dbPath);
  for (const comic of comics) {
    // Keep every comic inside the temp dir so CBZ fixtures can be written next to it.
    insertComic(db, { path: path.join(dir, 'library', `${comic.id}.cbz`), ...comic });
  }
  for (const pref of prefs) insertPref(db, pref);

  const config = loadConfig({ configPath, env: { COMICS_NOW_ROOT: root, ...appEnv } });
  // Hermetic default: tests must never reach a real ffmpeg. Inject a stub via
  // configOverrides to exercise the transcode path.
  Object.assign(config, { ffmpegBin: 'gve-now-test-missing-ffmpeg' }, configOverrides);
  fs.mkdirSync(config.guidedViewDir, { recursive: true });
  const store = createSidecarStore(config);
  for (const [id, obj] of Object.entries(sidecars)) store.write(id, obj);

  for (const [id, pages] of Object.entries(cbzPages)) {
    const row = db.prepare('SELECT path FROM comics WHERE id = ?').get(id);
    fs.mkdirSync(path.dirname(row.path), { recursive: true });
    const entries = pages.map((name) => [name, name.endsWith('.png') ? PNG_1PX : JPG_1PX]);
    await makeCbz(row.path, entries);
  }

  const app = createApp({ config, db, store, configPath, env: appEnv });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    dir,
    root,
    configPath,
    env: appEnv,
    config,
    db,
    store,
    server,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
      rmrf(dir);
    }
  };
}

module.exports = { startHarness, PNG_1PX, JPG_1PX };
