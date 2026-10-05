'use strict';

// Full-resolution WebP pages, sharing comics-now's page cache.
//
// comics-now's reader serves fmt=webp full-resolution WebP (no resize) from
// <page-cache>/<sha1(path:mtimeMs:entry:full)>_wfull.webp so that
// img.naturalWidth == original width — guided-view coordinates stay exact
// (server/routes/user/pages.js). We read that same cache and generate missing
// entries with ffmpeg (libwebp), so both apps share one warm cache and page
// coordinates always live in original-pixel space.
//
// Everything here is best-effort: any transcode failure falls back to the
// original archive bytes, which is exactly the old behavior.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Formats ffmpeg transcodes. GIFs stay untouched (a single WebP frame would
// kill the animation); anything else is served as-is.
const TRANSCODE_EXTS = ['.jpg', '.jpeg', '.png'];
const DEFAULT_QUALITY = 80;
const DEFAULT_TIMEOUT_MS = 30000;

// Must match comics-now's getPageCacheKey(path, floor(mtimeMs), entry, 'full').
function webpCacheKey(cbzPath, mtimeMs, entryName) {
  const raw = `${path.resolve(cbzPath)}:${Math.floor(mtimeMs)}:${entryName}:full`;
  return `${crypto.createHash('sha1').update(raw).digest('hex')}_wfull.webp`;
}

function isTranscodableEntry(name) {
  return TRANSCODE_EXTS.includes(path.extname(name).toLowerCase());
}

function readCacheFile(cacheDir, key) {
  if (!cacheDir) return null;
  try {
    return fs.readFileSync(path.join(cacheDir, key));
  } catch {
    return null;
  }
}

function writeCacheFile(cacheDir, key, buffer) {
  if (!cacheDir) return;
  const target = path.join(cacheDir, key);
  const temp = `${target}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 8)}`;
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(temp, buffer);
    fs.renameSync(temp, target);
  } catch {
    try {
      fs.unlinkSync(temp);
    } catch {
      // nothing to clean up
    }
  }
}

// The source is piped in (pipe:0) but the output goes to a real temp file:
// piped webp output is not seekable, so ffmpeg leaves the RIFF size field 0 and
// appends the real size as a trailer — a malformed file that strict decoders
// (Firefox) reject outright. With a seekable file ffmpeg writes a correct
// header. The temp file is always cleaned up.
function transcodeToWebp(sourceBuffer, { ffmpegBin = 'ffmpeg', quality = DEFAULT_QUALITY, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const outPath = path.join(
      os.tmpdir(),
      `gve-now-webp-${process.pid}-${Math.random().toString(36).slice(2, 8)}.webp`
    );
    const child = spawn(ffmpegBin, [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-c:v', 'libwebp', '-quality', String(quality),
      '-f', 'webp', outPath
    ]);
    let stderr = '';
    let done = false;
    let timer = null;
    const cleanup = () => {
      try {
        fs.unlinkSync(outPath);
      } catch {
        // never created or already gone
      }
    };
    const settle = (fn, value) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };
    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
      cleanup();
      settle(reject, new Error(`ffmpeg transcode timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', (err) => {
      cleanup();
      settle(reject, new Error(`ffmpeg: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        cleanup();
        return settle(reject, new Error(`ffmpeg: exit ${code}: ${stderr.trim() || 'no output'}`));
      }
      let buffer;
      try {
        buffer = fs.readFileSync(outPath);
      } catch (err) {
        cleanup();
        return settle(reject, new Error(`ffmpeg produced no output: ${err.message}`));
      }
      cleanup();
      settle(resolve, buffer);
    });
    // The child may exit (fail/timeout) before stdin drains; ignore EPIPE here
    // and surface the failure via the close/error handlers instead.
    child.stdin.on('error', () => {});
    child.stdin.end(sourceBuffer);
  });
}

// Concurrent requests for the same page share one transcode.
const inFlight = new Map();

// Resolve a page image: cached webp > fresh webp > original archive bytes.
async function getPageImage({ cbzPath, entryName, cacheDir, readEntry, ffmpegBin, quality, timeoutMs }) {
  const transcodable = isTranscodableEntry(entryName);
  if (transcodable) {
    const key = webpCacheKey(cbzPath, fs.statSync(cbzPath).mtimeMs, entryName);
    const cached = readCacheFile(cacheDir, key);
    if (cached) return { buffer: cached, contentType: 'image/webp', source: 'webp-cache' };

    const source = await readEntry(cbzPath, entryName);
    try {
      let pending = inFlight.get(key);
      if (!pending) {
        pending = transcodeToWebp(source, { ffmpegBin, quality, timeoutMs });
        inFlight.set(key, pending);
        pending.then(
          () => inFlight.delete(key),
          () => inFlight.delete(key)
        );
      }
      const webp = await pending;
      writeCacheFile(cacheDir, key, webp);
      return { buffer: webp, contentType: 'image/webp', source: 'webp-new' };
    } catch {
      return { buffer: source, contentType: null, source: 'original' };
    }
  }

  const source = await readEntry(cbzPath, entryName);
  return { buffer: source, contentType: null, source: 'original' };
}

module.exports = { webpCacheKey, isTranscodableEntry, transcodeToWebp, getPageImage };
