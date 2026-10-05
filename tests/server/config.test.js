const fs = require('fs');
const path = require('path');
const { loadConfig, previewConfig, rehomeRoot, resolveConfig, saveConfig, validateConfig } = require('../../src/server/config');
const { tmpDir, rmrf } = require('../helpers/tmp');

describe('server/config', () => {
  let dir;
  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rmrf(dir);
  });

  it('applies defaults relative to comicsNowRoot when no config file exists', () => {
    const config = loadConfig({ configPath: path.join(dir, 'missing.json'), env: { COMICS_NOW_ROOT: dir } });
    expect(config.port).toBe(3100);
    expect(config.bind).toBe('127.0.0.1');
    expect(config.comicsNowRoot).toBe(dir);
    expect(config.dbPath).toBe(path.join(dir, 'comics-now.db'));
    expect(config.guidedViewDir).toBe(path.join(dir, 'metadata', 'guided_view'));
    expect(config.backupDir).toBe(path.join(dir, 'metadata', 'guided_view', '.backups'));
    expect(config.prefsUserId).toBe('default-user');
    expect(config.libraries).toEqual([]);
    expect(config.pageCacheDir).toBe(path.join(dir, 'page-cache'));
    expect(config.ffmpegBin).toBe('ffmpeg');
  });

  it('reads the config file and lets env override it', () => {
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ port: 4444, comicsNowRoot: '/elsewhere' }));
    const fromFile = loadConfig({ configPath, env: {} });
    expect(fromFile.port).toBe(4444);
    expect(fromFile.comicsNowRoot).toBe('/elsewhere');
    expect(fromFile.dbPath).toBe(path.join('/elsewhere', 'comics-now.db'));

    const fromEnv = loadConfig({ configPath, env: { GVE_NOW_PORT: '5555', GVE_NOW_BIND: '127.0.0.2', COMICS_NOW_ROOT: '/env-root' } });
    expect(fromEnv.port).toBe(5555);
    expect(fromEnv.bind).toBe('127.0.0.2');
    expect(fromEnv.comicsNowRoot).toBe('/env-root');
  });

  it('throws an error on a malformed config file', () => {
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, '{not json');
    expect(() => loadConfig({ configPath, env: { COMICS_NOW_ROOT: dir } })).toThrow(/failed to parse config file/i);
  });

  it('resolves library roots from the comics-now config, appending comicsLocation', () => {
    const root = path.join(dir, 'comics-now');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({
      libraries: [{ path: path.join(dir, 'libs', 'A') }, { path: path.join(dir, 'libs', 'B') }],
      comicsLocation: path.join(dir, 'libs', 'fallback')
    }));
    const config = loadConfig({ configPath: path.join(dir, 'missing.json'), env: { COMICS_NOW_ROOT: root } });
    expect(config.libraries).toEqual([path.join(dir, 'libs', 'A'), path.join(dir, 'libs', 'B'), path.join(dir, 'libs', 'fallback')]);
  });

  it('validates that the database exists', () => {
    const dbPath = path.join(dir, 'comics-now.db');
    fs.writeFileSync(dbPath, '');
    const ok = validateConfig({ dbPath, guidedViewDir: dir, comicsNowRoot: dir });
    expect(ok.ok).toBe(true);

    const bad = validateConfig({ dbPath: path.join(dir, 'nope.db'), guidedViewDir: dir, comicsNowRoot: dir });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/database/i);
    expect(bad.errors.join(' ')).toContain('nope.db');
  });

  describe('saveConfig', () => {
    it('merges updates into the existing file, preserving unknown keys', () => {
      const configPath = path.join(dir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ bind: '0.0.0.0', custom: 42 }));
      saveConfig({ comicsNowRoot: '/new/root' }, { configPath });
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({
        bind: '0.0.0.0',
        custom: 42,
        comicsNowRoot: '/new/root'
      });
    });

    it('writes atomically through a temp file in the same directory, then renames', () => {
      const configPath = path.join(dir, 'config.json');
      const rename = jest.spyOn(fs, 'renameSync');
      saveConfig({ comicsNowRoot: '/x' }, { configPath });

      expect(rename).toHaveBeenCalledTimes(1);
      const [from, to] = rename.mock.calls[0];
      expect(to).toBe(configPath);
      expect(from).not.toBe(configPath);
      expect(path.dirname(from)).toBe(dir);
      expect(fs.existsSync(from)).toBe(false);
      expect(fs.readdirSync(dir)).toEqual(['config.json']);
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({ comicsNowRoot: '/x' });
    });

    it('creates file when missing and rejects saving over a corrupt existing file', () => {
      const configPath = path.join(dir, 'config.json');

      saveConfig({ comicsNowRoot: '/a' }, { configPath });
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({ comicsNowRoot: '/a' });

      fs.writeFileSync(configPath, '{not json');
      expect(() => saveConfig({ comicsNowRoot: '/b' }, { configPath })).toThrow(/failed to parse config file/i);
    });

    it('deletes keys listed in removeKeys in the same atomic write', () => {
      const configPath = path.join(dir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        comicsNowRoot: '/old',
        dbPath: '/old/comics-now.db',
        bind: '0.0.0.0'
      }));
      saveConfig({ comicsNowRoot: '/new' }, { configPath, removeKeys: ['dbPath'] });
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({ comicsNowRoot: '/new', bind: '0.0.0.0' });
    });
  });

  describe('rehomeRoot', () => {
    it('drops pins that repeat the old root derivation, leaving a config that fully resolves from the new root', () => {
      const file = {
        comicsNowRoot: '/old',
        dbPath: '/old/comics-now.db',
        guidedViewDir: '/old/metadata/guided_view',
        backupDir: '/old/metadata/guided_view/.backups',
        pageCacheDir: '/old/page-cache'
      };
      const { file: next, dropped, conflicts } = rehomeRoot(file, '/new');
      expect(conflicts).toEqual([]);
      expect(dropped.sort()).toEqual(['backupDir', 'dbPath', 'guidedViewDir', 'pageCacheDir']);
      expect(next).toEqual({ comicsNowRoot: '/new' });

      const resolved = resolveConfig(next, {});
      expect(resolved.dbPath).toBe('/new/comics-now.db');
      expect(resolved.guidedViewDir).toBe('/new/metadata/guided_view');
      expect(resolved.backupDir).toBe('/new/metadata/guided_view/.backups');
      expect(resolved.pageCacheDir).toBe('/new/page-cache');
    });

    it('flags genuinely custom pins as conflicts and drops nothing', () => {
      const file = { comicsNowRoot: '/old', dbPath: '/data/shared/comics-now.db' };
      const { file: next, dropped, conflicts } = rehomeRoot(file, '/new');
      expect(conflicts).toEqual([{ key: 'dbPath', value: '/data/shared/comics-now.db' }]);
      expect(dropped).toEqual([]);
      expect(next).toEqual({ comicsNowRoot: '/new', dbPath: '/data/shared/comics-now.db' });
    });

    it('treats a backupDir that follows a custom guidedViewDir as stale relative to the pin', () => {
      const file = { comicsNowRoot: '/old', guidedViewDir: '/data/guided', backupDir: '/data/guided/.backups' };
      const { dropped, conflicts } = rehomeRoot(file, '/new');
      expect(conflicts).toEqual([{ key: 'guidedViewDir', value: '/data/guided' }]);
      expect(dropped).toEqual(['backupDir']);
    });

    it('is a no-op for all-derived configs', () => {
      const file = { comicsNowRoot: '/old', bind: '0.0.0.0' };
      const { file: next, dropped, conflicts } = rehomeRoot(file, '/new');
      expect(dropped).toEqual([]);
      expect(conflicts).toEqual([]);
      expect(next).toEqual({ comicsNowRoot: '/new', bind: '0.0.0.0' });
    });
  });

  describe('previewConfig', () => {
    it('resolves the config as if the changes were applied, keeping other file keys', () => {
      const configPath = path.join(dir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ bind: '0.0.0.0', port: 4444 }));

      const preview = previewConfig({ configPath, env: {}, changes: { comicsNowRoot: '/new/root' } });
      expect(preview.comicsNowRoot).toBe('/new/root');
      expect(preview.dbPath).toBe(path.join('/new/root', 'comics-now.db'));
      expect(preview.guidedViewDir).toBe(path.join('/new/root', 'metadata', 'guided_view'));
      expect(preview.backupDir).toBe(path.join('/new/root', 'metadata', 'guided_view', '.backups'));
      expect(preview.pageCacheDir).toBe(path.join('/new/root', 'page-cache'));
      expect(preview.bind).toBe('0.0.0.0');
      expect(preview.port).toBe(4444);

      // preview never touches the file
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({ bind: '0.0.0.0', port: 4444 });
    });

    it('still lets env win over the change', () => {
      const configPath = path.join(dir, 'config.json');
      const preview = previewConfig({
        configPath,
        env: { COMICS_NOW_ROOT: '/env/root', GVE_NOW_PORT: '5555' },
        changes: { comicsNowRoot: '/new/root' }
      });
      expect(preview.comicsNowRoot).toBe('/env/root');
      expect(preview.dbPath).toBe(path.join('/env/root', 'comics-now.db'));
      expect(preview.port).toBe(5555);
    });
  });
});
