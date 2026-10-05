'use strict';

const path = require('path');

const SUMMARY_COLUMNS = 'id, publisher, series, name, path, metadata, totalPages, updatedAt, guidedViewStatus, guidedViewError, guidedViewPath';

function parseMetadata(raw) {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function toSummary(row) {
  if (!row) return null;
  return { ...row, metadata: parseMetadata(row.metadata) };
}

function escapeLike(str) {
  return str.replace(/([\\%_])/g, '\\$1');
}

function whereClause({ q = '', status = '' } = {}) {
  const where = [];
  const params = [];
  if (q) {
    where.push("(series LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\')");
    const escaped = escapeLike(q);
    params.push(`%${escaped}%`, `%${escaped}%`);
  }
  if (status) {
    where.push('guidedViewStatus = ?');
    params.push(status);
  }
  return { where, params };
}

function searchComics(db, { q = '', status = '', limit = 50, offset = 0 } = {}) {
  const { where, params } = whereClause({ q, status });
  let sql = `SELECT ${SUMMARY_COLUMNS} FROM comics`;
  if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ' ORDER BY series, name LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(sql).all(...params).map(toSummary);
}

// Same filters as searchComics, without the page window.
function countComics(db, { q = '', status = '' } = {}) {
  const { where, params } = whereClause({ q, status });
  let sql = 'SELECT COUNT(*) AS total FROM comics';
  if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`;
  return db.prepare(sql).get(...params).total;
}

function getComic(db, id) {
  return toSummary(db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM comics WHERE id = ?`).get(id));
}

// Port of comics-now's getReadingPrefMaps + resolveReadingModes (server/db.js:419,513):
// user rows override default-user rows when non-null; hierarchy is
// comic -> series -> publisher -> library, first non-null mangaMode wins.
function loadPrefMaps(db, userId) {
  const maps = { comic: new Map(), series: new Map(), publisher: new Map(), library: new Map() };
  let rows;
  if (userId && userId !== 'default-user') {
    rows = db.prepare(`SELECT preferenceType, targetId, mangaMode FROM user_reading_preferences
      WHERE userId IN (?, 'default-user')
      ORDER BY CASE WHEN userId = ? THEN 1 ELSE 0 END ASC`).all(userId, userId);
  } else if (userId) {
    rows = db.prepare(`SELECT preferenceType, targetId, mangaMode FROM user_reading_preferences WHERE userId = ?`).all(userId);
  } else {
    rows = db.prepare(`SELECT preferenceType, targetId, mangaMode FROM user_reading_preferences
      WHERE mangaMode IS NOT NULL
      ORDER BY CASE WHEN userId = 'default-user' THEN 0 ELSE 1 END ASC`).all();
  }
  for (const row of rows) {
    if (!maps[row.preferenceType]) continue;
    const value = row.mangaMode === 1 ? true : row.mangaMode === 0 ? false : null;
    const existing = maps[row.preferenceType].get(row.targetId);
    if (existing) {
      maps[row.preferenceType].set(row.targetId, { mangaMode: value !== null ? value : existing.mangaMode });
    } else {
      maps[row.preferenceType].set(row.targetId, { mangaMode: value });
    }
  }
  return maps;
}

// Build a resolver that shares one preference read across many comics.
function makeMangaModeResolver(db, userId, libraries) {
  const prefMaps = loadPrefMaps(db, userId);
  return (comic) => {
    const levels = [];
    if (prefMaps.comic.has(comic.id)) levels.push(prefMaps.comic.get(comic.id));
    if (comic.series && prefMaps.series.has(comic.series)) levels.push(prefMaps.series.get(comic.series));
    if (comic.publisher && prefMaps.publisher.has(comic.publisher)) levels.push(prefMaps.publisher.get(comic.publisher));
    if (comic.path && Array.isArray(libraries) && libraries.length > 0) {
      const root = libraries.find((dir) => {
        const prefix = dir.endsWith(path.sep) ? dir : dir + path.sep;
        return comic.path === dir || comic.path.startsWith(prefix);
      });
      if (root && prefMaps.library.has(root)) levels.push(prefMaps.library.get(root));
    }
    for (const level of levels) {
      if (level.mangaMode !== null && level.mangaMode !== undefined) return level.mangaMode;
    }
    return false;
  };
}

function resolveMangaMode(db, userId, comic, libraries) {
  return makeMangaModeResolver(db, userId, libraries)(comic);
}

module.exports = { parseMetadata, searchComics, countComics, getComic, loadPrefMaps, makeMangaModeResolver, resolveMangaMode };
