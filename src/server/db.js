'use strict';

const Database = require('better-sqlite3');

function openDatabase(dbPath, { readonly = false, busyTimeout = 5000 } = {}) {
  const db = new Database(dbPath, { readonly });
  if (!readonly) db.pragma(`busy_timeout = ${busyTimeout}`);
  return db;
}

function isBusyError(err) {
  return Boolean(err) && (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED' || /busy|locked/i.test(err.message));
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Run a guided-view status UPDATE with busy retry. Never touches updatedAt (the
// scan-skip key). Throws after `retries` busy failures, or when the row is missing.
function runGuidedViewUpdate(db, sql, params, comicId, { retries = 3, delayMs = 250 } = {}) {
  const stmt = db.prepare(sql);
  let lastBusy = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const info = stmt.run(...params);
      if (info.changes === 0) throw new Error(`comic not found: ${comicId}`);
      return true;
    } catch (err) {
      if (!isBusyError(err)) throw err;
      lastBusy = err;
      if (attempt < retries) sleep(delayMs);
    }
  }
  throw lastBusy;
}

function markGuidedViewComplete(db, comicId, sidecarPath, opts) {
  return runGuidedViewUpdate(
    db,
    `UPDATE comics SET guidedViewStatus = 'completed', guidedViewError = NULL, guidedViewPath = ? WHERE id = ?`,
    [sidecarPath, comicId],
    comicId,
    opts
  );
}

function markGuidedViewPending(db, comicId, opts) {
  return runGuidedViewUpdate(
    db,
    `UPDATE comics SET guidedViewStatus = 'pending', guidedViewError = NULL, guidedViewPath = NULL WHERE id = ?`,
    [comicId],
    comicId,
    opts
  );
}

module.exports = { openDatabase, markGuidedViewComplete, markGuidedViewPending };
