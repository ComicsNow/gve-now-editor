'use strict';

// Test DB uses the real comics-now DDL for the tables the editor touches
// (server/db.js in /opt/comics-now). The users FK is omitted — tests don't need it.

const Database = require('better-sqlite3');

const COMICS_DDL = `CREATE TABLE IF NOT EXISTS comics (
  id TEXT PRIMARY KEY,
  publisher TEXT,
  series TEXT,
  name TEXT,
  path TEXT UNIQUE,
  metadata TEXT,
  lastReadPage INTEGER DEFAULT 0,
  totalPages INTEGER DEFAULT 0,
  updatedAt INTEGER,
  thumbnailPath TEXT,
  convertedAt INTEGER,
  guidedViewStatus TEXT DEFAULT 'pending',
  guidedViewError TEXT,
  guidedViewPath TEXT,
  guidedMode INTEGER DEFAULT 0,
  bubbleMode INTEGER DEFAULT 0,
  libraryMode TEXT DEFAULT 'metadata',
  tagStatus TEXT DEFAULT 'pending'
)`;

const PREFS_DDL = `CREATE TABLE IF NOT EXISTS user_reading_preferences (
  userId TEXT NOT NULL,
  preferenceType TEXT NOT NULL,
  targetId TEXT NOT NULL,
  mangaMode INTEGER DEFAULT 0,
  continuousMode INTEGER DEFAULT NULL,
  createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  PRIMARY KEY (userId, preferenceType, targetId)
)`;

function createTestDb(dbPath) {
  const db = new Database(dbPath);
  db.exec(COMICS_DDL);
  db.exec(PREFS_DDL);
  return db;
}

// Insert a comic row with sensible defaults; returns the id.
function insertComic(db, row) {
  const r = {
    id: 'c1',
    publisher: 'Pub',
    series: 'Ser',
    name: `${row.id || 'c1'}.cbz`,
    path: `/libs/A/${row.id || 'c1'}.cbz`,
    metadata: '{}',
    lastReadPage: 0,
    totalPages: 10,
    updatedAt: 1000,
    thumbnailPath: null,
    convertedAt: null,
    guidedViewStatus: 'pending',
    guidedViewError: null,
    guidedViewPath: null,
    guidedMode: 0,
    bubbleMode: 0,
    libraryMode: 'metadata',
    tagStatus: 'pending',
    ...row
  };
  db.prepare(`INSERT INTO comics (
    id, publisher, series, name, path, metadata, lastReadPage, totalPages, updatedAt,
    thumbnailPath, convertedAt, guidedViewStatus, guidedViewError, guidedViewPath,
    guidedMode, bubbleMode, libraryMode, tagStatus
  ) VALUES (
    @id, @publisher, @series, @name, @path, @metadata, @lastReadPage, @totalPages, @updatedAt,
    @thumbnailPath, @convertedAt, @guidedViewStatus, @guidedViewError, @guidedViewPath,
    @guidedMode, @bubbleMode, @libraryMode, @tagStatus
  )`).run(r);
  return r.id;
}

// Insert a reading preference; mangaMode may be null (unspecified).
function insertPref(db, { userId = 'default-user', preferenceType, targetId, mangaMode = null, continuousMode = null }) {
  db.prepare(`INSERT INTO user_reading_preferences
    (userId, preferenceType, targetId, mangaMode, continuousMode)
    VALUES (?, ?, ?, ?, ?)`).run(userId, preferenceType, targetId, mangaMode, continuousMode);
}

module.exports = { createTestDb, insertComic, insertPref };
