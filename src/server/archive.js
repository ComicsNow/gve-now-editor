'use strict';

// CBZ access — port of comics-now's archive-utils.js (image filter,
// dotfile/__MACOSX skip, numeric-aware localeCompare).
//
// Entry data is read via the system `unzip -p`, mirroring comics-now's reader.
// yauzl is only a fallback: its openReadStream stalls forever (emits nothing,
// never settles) on entries with a large incompressible compressed size — the
// shape of every real scan page — so it cannot be the primary read path.

const path = require('path');
const { spawn } = require('child_process');
const yauzl = require('yauzl');

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];

function isImage(name) {
  return IMAGE_EXTS.includes(path.extname(name).toLowerCase());
}

function isPageEntry(name) {
  if (!isImage(name)) return false;
  return !name.split('/').some((part) => part.startsWith('.') || part === '__MACOSX');
}

// Mirrors comics-now's archive-utils.js: reject absolute paths and any '..'
// segment before an entry name reaches either reader.
function isSafeEntry(name) {
  if (typeof name !== 'string' || name === '') return false;
  if (path.isAbsolute(name)) return false;
  const parts = name.split(/[\\/]/);
  return !parts.includes('..');
}

// `unzip` treats [ ] * ? \ as glob metacharacters; escape them so the name
// matches exactly one entry.
function escapeZipGlob(name) {
  return name.replace(/([[*?\\])/g, '\\$1');
}

function openZip(cbzPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(cbzPath, { lazyEntries: true }, (err, zip) => (err ? reject(err) : resolve(zip)));
  });
}

function closeQuietly(zip) {
  try {
    zip.close();
  } catch {
    // already closed
  }
}

function listPages(cbzPath) {
  return openZip(cbzPath).then((zip) => new Promise((resolve, reject) => {
    const names = [];
    zip.on('entry', (entry) => {
      if (!/\/$/.test(entry.fileName) && isPageEntry(entry.fileName)) names.push(entry.fileName);
      zip.readEntry();
    });
    zip.on('end', () => {
      closeQuietly(zip);
      resolve(names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })));
    });
    zip.on('error', (err) => {
      closeQuietly(zip);
      reject(err);
    });
    zip.readEntry();
  }));
}

function readViaUnzip(cbzPath, entryName, unzipBin) {
  return new Promise((resolve, reject) => {
    const child = spawn(unzipBin, ['-p', '--', cbzPath, escapeZipGlob(entryName)]);
    const chunks = [];
    let stderr = '';
    let done = false;
    const settle = (fn, value) => {
      if (done) return;
      done = true;
      fn(value);
    };
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', (err) => settle(reject, new Error(`unzip: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0 && chunks.length > 0) return settle(resolve, Buffer.concat(chunks));
      settle(reject, new Error(`unzip: exit ${code}: ${stderr.trim() || 'no output'}`));
    });
  });
}

function readViaYauzl(cbzPath, entryName, timeoutMs) {
  return openZip(cbzPath).then((zip) => new Promise((resolve, reject) => {
    let done = false;
    let timer = null;
    const settle = (fn, value) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };
    timer = setTimeout(() => {
      closeQuietly(zip);
      settle(reject, new Error(`yauzl read timed out after ${timeoutMs}ms: ${entryName}`));
    }, timeoutMs);
    let found = false;
    zip.on('entry', (entry) => {
      if (entry.fileName !== entryName) return zip.readEntry();
      found = true;
      zip.openReadStream(entry, (err, stream) => {
        if (err) {
          closeQuietly(zip);
          return settle(reject, err);
        }
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          closeQuietly(zip);
          settle(resolve, Buffer.concat(chunks));
        });
        stream.on('error', (streamErr) => {
          closeQuietly(zip);
          settle(reject, streamErr);
        });
      });
    });
    zip.on('end', () => {
      if (!found) {
        closeQuietly(zip);
        settle(reject, new Error(`entry not found: ${entryName}`));
      }
    });
    zip.on('error', (err) => {
      closeQuietly(zip);
      settle(reject, err);
    });
    zip.readEntry();
  }));
}

function getEntryBuffer(cbzPath, entryName, { yauzlTimeoutMs = 10000, unzipBin = 'unzip' } = {}) {
  if (!isSafeEntry(entryName)) {
    return Promise.reject(new Error(`unsafe entry name (path traversal): ${JSON.stringify(entryName)}`));
  }
  return readViaUnzip(cbzPath, entryName, unzipBin).catch((unzipErr) =>
    readViaYauzl(cbzPath, entryName, yauzlTimeoutMs).catch((yauzlErr) => {
      throw new Error(`failed to read ${entryName}: ${unzipErr.message}; ${yauzlErr.message}`);
    })
  );
}

module.exports = { listPages, getEntryBuffer, isImage, isPageEntry, isSafeEntry, escapeZipGlob };
