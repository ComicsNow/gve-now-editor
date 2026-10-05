'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  port: 3100,
  bind: '127.0.0.1',
  comicsNowRoot: '/opt/comics-now',
  ffmpegBin: 'ffmpeg',
  prefsUserId: 'default-user'
};

function readConfigFile(configPath) {
  if (!configPath || !fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) || {};
  } catch (err) {
    throw new Error(`failed to parse config file at ${configPath}: ${err.message}`);
  }
}

// Resolve the editor config: defaults < config.json (or `file`) < env.
// Library roots mirror comics-now's getComicsDirectories: libraries[].path plus
// comicsLocation when not already covered.
function resolveConfig(file, env = process.env) {
  const comicsNowRoot = env.COMICS_NOW_ROOT || file.comicsNowRoot || DEFAULTS.comicsNowRoot;
  const guidedViewDir = file.guidedViewDir || path.join(comicsNowRoot, 'metadata', 'guided_view');

  return {
    port: env.GVE_NOW_PORT ? Number(env.GVE_NOW_PORT) : file.port !== undefined ? file.port : DEFAULTS.port,
    bind: env.GVE_NOW_BIND || file.bind || DEFAULTS.bind,
    comicsNowRoot,
    dbPath: file.dbPath || path.join(comicsNowRoot, 'comics-now.db'),
    guidedViewDir,
    backupDir: file.backupDir || path.join(guidedViewDir, '.backups'),
    // Shared with comics-now's reader: full-res webp page cache (see page-webp.js).
    pageCacheDir: file.pageCacheDir || path.join(comicsNowRoot, 'page-cache'),
    ffmpegBin: file.ffmpegBin || DEFAULTS.ffmpegBin,
    prefsUserId: file.prefsUserId || DEFAULTS.prefsUserId,
    libraries: Array.isArray(file.libraries) ? file.libraries : readComicLibraries(comicsNowRoot)
  };
}

function loadConfig({ configPath, env = process.env } = {}) {
  return resolveConfig(readConfigFile(configPath), env);
}

// The config the app would run with if `changes` were merged into config.json;
// nothing is written. Env still wins where it is set.
function previewConfig({ configPath, env = process.env, changes = {} } = {}) {
  return resolveConfig({ ...readConfigFile(configPath), ...changes }, env);
}

// What each pinnable path key would resolve to if the file did not pin just
// that key (other pins stay, so backupDir is judged against a custom
// guidedViewDir if one is pinned). Used to tell a stale pin — one that merely
// repeats a derived default — from a deliberate custom path.
function derivedPathKeys(file) {
  const result = {};
  for (const key of ['dbPath', 'guidedViewDir', 'backupDir', 'pageCacheDir']) {
    const unpinned = { ...file };
    delete unpinned[key];
    result[key] = resolveConfig(unpinned, {})[key];
  }
  return result;
}

// Re-home the config when comicsNowRoot changes: pins that repeat what the old
// root derived are stale and get dropped (so the new root re-derives them —
// keeping them would split the app between two roots); pins that are genuinely
// custom cannot be re-derived and are reported as conflicts for the caller to
// resolve. Returns { file, dropped, conflicts }.
function rehomeRoot(file, newRoot) {
  const derived = derivedPathKeys(file);
  const next = { ...file, comicsNowRoot: newRoot };
  const dropped = [];
  const conflicts = [];
  for (const key of Object.keys(derived)) {
    if (file[key] === undefined) continue;
    if (file[key] === derived[key]) {
      delete next[key];
      dropped.push(key);
    } else {
      conflicts.push({ key, value: file[key] });
    }
  }
  return { file: next, dropped, conflicts };
}

// Merge `updates` into config.json, preserving keys we do not own (e.g. bind);
// `removeKeys` deletes stale keys in the same write. Atomic: write a temp file
// next to the target, then rename over it.
function saveConfig(updates, { configPath, removeKeys = [] } = {}) {
  if (!configPath) throw new Error('saveConfig requires a configPath');
  const next = { ...readConfigFile(configPath), ...updates };
  for (const key of removeKeys) delete next[key];
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(configPath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    fs.renameSync(tmpPath, configPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // nothing to clean up
    }
    throw err;
  }
  return next;
}

function readComicLibraries(comicsNowRoot) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(comicsNowRoot, 'config.json'), 'utf8')) || {};
    const dirs = (Array.isArray(parsed.libraries) ? parsed.libraries : [])
      .map((lib) => lib && lib.path)
      .filter(Boolean);
    if (parsed.comicsLocation && !dirs.includes(parsed.comicsLocation)) dirs.push(parsed.comicsLocation);
    return dirs;
  } catch {
    return [];
  }
}

// Boot validation: the DB is a hard requirement (fail fast); the guided-view dir
// is creatable, so a missing one is only a warning.
function validateConfig(config) {
  const errors = [];
  const warnings = [];
  if (!fs.existsSync(config.dbPath)) errors.push(`comics-now database not found: ${config.dbPath}`);
  if (!fs.existsSync(config.guidedViewDir)) warnings.push(`guided view directory does not exist yet: ${config.guidedViewDir}`);
  return { ok: errors.length === 0, errors, warnings };
}

module.exports = {
  loadConfig,
  readConfigFile,
  resolveConfig,
  previewConfig,
  rehomeRoot,
  saveConfig,
  validateConfig,
  DEFAULTS
};
