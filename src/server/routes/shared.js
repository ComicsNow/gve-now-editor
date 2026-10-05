'use strict';

const fs = require('fs');
const path = require('path');
const { getComic, makeMangaModeResolver } = require('../comics-repo');
const { listPages, getEntryBuffer } = require('../archive');
const { imageDimensions } = require('../page-dims');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif'
};

function mimeFor(name) {
  return MIME_BY_EXT[path.extname(name).toLowerCase()] || 'application/octet-stream';
}

// Load a comic row (metadata parsed) + its resolved mangaMode; null when unknown.
function loadComic(db, config, id) {
  const comic = getComic(db, id);
  if (!comic) return null;
  const mangaMode = makeMangaModeResolver(db, config.prefsUserId, config.libraries)(comic);
  return { comic, mangaMode };
}

// The sidecar's own type wins (the reader gates on mangaMode, but existing data
// keeps its type); otherwise derive from the resolved mangaMode.
function canonicalType(store, id, mangaMode) {
  const sidecar = store.read(id);
  if (sidecar && (sidecar.type === 'manga' || sidecar.type === 'western')) return sidecar.type;
  return mangaMode ? 'manga' : 'western';
}

// In-memory cache for page dimensions keyed by (resolvedPath:mtime:entryName).
const dimensionCache = new Map();

function clearDimensionCache() {
  dimensionCache.clear();
}

// Dimensions for every page entry (null when unreadable), cached across requests.
async function pageDimensions(cbzPath, names) {
  let mtime = 0;
  try {
    mtime = Math.floor(fs.statSync(cbzPath).mtimeMs);
  } catch {}
  const resolved = path.resolve(cbzPath);

  const dims = new Map();
  for (const name of names) {
    const key = `${resolved}:${mtime}:${name}`;
    if (dimensionCache.has(key)) {
      dims.set(name, dimensionCache.get(key));
    } else {
      try {
        const d = imageDimensions(await getEntryBuffer(cbzPath, name));
        dimensionCache.set(key, d);
        dims.set(name, d);
      } catch {
        dimensionCache.set(key, null);
        dims.set(name, null);
      }
    }
  }
  return dims;
}

function appendMissing(base, extra) {
  const out = base.slice();
  for (const name of extra) {
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

module.exports = { mimeFor, loadComic, canonicalType, pageDimensions, appendMissing, listPages, clearDimensionCache };
