'use strict';

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

// Dimensions for every page entry (null when unreadable).
async function pageDimensions(cbzPath, names) {
  const dims = new Map();
  for (const name of names) {
    try {
      dims.set(name, imageDimensions(await getEntryBuffer(cbzPath, name)));
    } catch {
      dims.set(name, null);
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

module.exports = { mimeFor, loadComic, canonicalType, pageDimensions, appendMissing, listPages };
