'use strict';

const Database = require('better-sqlite3');

// busyTimeout is deliberately low: better-sqlite3 is synchronous, so a high
// busy_timeout would block the event loop inside stmt.run() while comics-now
// holds a write lock. runGuidedViewUpdate does the longer waiting asynchronously.
function openDatabase(dbPath, { readonly = false, busyTimeout = 200 } = {}) {
  const db = new Database(dbPath, { readonly });
  if (!readonly) db.pragma(`busy_timeout = ${busyTimeout}`);
  return db;
}

function isBusyError(err) {
  return Boolean(err) && (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED' || /busy|locked/i.test(err.message));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run a guided-view status UPDATE with busy retry. Never touches updatedAt (the
// scan-skip key). Throws after `retries` busy failures, or when the row is missing.
// Waits between attempts with exponential async backoff (capped at maxDelayMs) so
// the event loop stays free while comics-now holds the write lock — see
// openDatabase on why busy_timeout is kept low.
async function runGuidedViewUpdate(db, sql, params, comicId, { retries = 5, delayMs = 250, maxDelayMs = 2000 } = {}) {
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
      if (attempt < retries) await sleep(Math.min(delayMs * 2 ** attempt, maxDelayMs));
    }
  }
  throw lastBusy;
}

async function markGuidedViewComplete(db, comicId, sidecarPath, opts) {
  return runGuidedViewUpdate(
    db,
    `UPDATE comics SET guidedViewStatus = 'completed', guidedViewError = NULL, guidedViewPath = ? WHERE id = ?`,
    [sidecarPath, comicId],
    comicId,
    opts
  );
}

async function markGuidedViewPending(db, comicId, opts) {
  return runGuidedViewUpdate(
    db,
    `UPDATE comics SET guidedViewStatus = 'pending', guidedViewError = NULL, guidedViewPath = NULL WHERE id = ?`,
    [comicId],
    comicId,
    opts
  );
}

module.exports = { openDatabase, markGuidedViewComplete, markGuidedViewPending };
