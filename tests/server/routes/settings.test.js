const fs = require('fs');
const path = require('path');
const { startHarness } = require('../../helpers/app-harness');
const { api } = require('../../helpers/api');

describe('routes/settings', () => {
  let h;
  beforeAll(async () => {
    h = await startHarness({
      comics: [{ id: 'c1', metadata: '{}' }],
      cbzPages: { c1: ['p1.jpg'] },
      configFile: { bind: '0.0.0.0' }
    });
  });
  afterAll(() => h.close());

  it('GET returns the resolved settings, env flags and validation', async () => {
    const { status, body } = await api(h.baseUrl, '/api/settings');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.configPath).toBe(h.configPath);
    expect(body.settings.comicsNowRoot).toBe(h.root);
    expect(body.settings.dbPath).toBe(h.config.dbPath);
    expect(body.settings.guidedViewDir).toBe(h.config.guidedViewDir);
    expect(body.settings.backupDir).toBe(h.config.backupDir);
    expect(body.settings.pageCacheDir).toBe(h.config.pageCacheDir);
    expect(body.settings.port).toBe(3100);
    expect(body.settings.bind).toBe('0.0.0.0');
    expect(body.env).toEqual({ comicsNowRoot: false, port: false, bind: false });
    expect(Array.isArray(body.validation.errors)).toBe(true);
    expect(Array.isArray(body.validation.warnings)).toBe(true);
  });

  it('PUT rejects a nonexistent directory with 400 and leaves the file untouched', async () => {
    const before = fs.readFileSync(h.configPath, 'utf8');
    const { status, body } = await api(h.baseUrl, '/api/settings', {
      method: 'PUT',
      body: { comicsNowRoot: path.join(h.dir, 'does-not-exist') }
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.errors.join(' ')).toMatch(/database/i);
    expect(fs.readFileSync(h.configPath, 'utf8')).toBe(before);
  });

  it('PUT rejects a directory that exists but has no comics-now.db', async () => {
    const empty = path.join(h.dir, 'empty-root');
    fs.mkdirSync(empty, { recursive: true });
    const { status, body } = await api(h.baseUrl, '/api/settings', {
      method: 'PUT',
      body: { comicsNowRoot: empty }
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.errors.join(' ')).toContain(path.join(empty, 'comics-now.db'));
    expect(fs.readFileSync(h.configPath, 'utf8')).not.toContain('empty-root');
  });

  it('PUT saves a valid root, preserves other keys and asks for a restart', async () => {
    const newRoot = path.join(h.dir, 'new-root');
    fs.mkdirSync(newRoot, { recursive: true });
    fs.writeFileSync(path.join(newRoot, 'comics-now.db'), '');

    const { status, body } = await api(h.baseUrl, '/api/settings', {
      method: 'PUT',
      body: { comicsNowRoot: newRoot }
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.restartRequired).toBe(true);
    expect(body.message).toContain('systemctl restart gve-now');
    expect(body.settings.comicsNowRoot).toBe(newRoot);
    expect(body.settings.dbPath).toBe(path.join(newRoot, 'comics-now.db'));
    expect(body.settings.guidedViewDir).toBe(path.join(newRoot, 'metadata', 'guided_view'));
    expect(body.settings.backupDir).toBe(path.join(newRoot, 'metadata', 'guided_view', '.backups'));
    expect(body.settings.pageCacheDir).toBe(path.join(newRoot, 'page-cache'));
    expect(body.settings.bind).toBe('0.0.0.0');

    const onDisk = JSON.parse(fs.readFileSync(h.configPath, 'utf8'));
    expect(onDisk.comicsNowRoot).toBe(newRoot);
    expect(onDisk.bind).toBe('0.0.0.0');
  });

  it('PUT rejects a missing or empty comicsNowRoot', async () => {
    const { status, body } = await api(h.baseUrl, '/api/settings', { method: 'PUT', body: {} });
    expect(status).toBe(400);
    expect(body.errors.join(' ')).toMatch(/comicsNowRoot/);

    const blank = await api(h.baseUrl, '/api/settings', { method: 'PUT', body: { comicsNowRoot: '   ' } });
    expect(blank.status).toBe(400);
  });

  it('warns that COMICS_NOW_ROOT env overrides the saved file', async () => {
    const h2 = await startHarness({ env: ({ root }) => ({ COMICS_NOW_ROOT: root }) });
    try {
      const get = await api(h2.baseUrl, '/api/settings');
      expect(get.body.env.comicsNowRoot).toBe(true);

      const newRoot = path.join(h2.dir, 'other-root');
      fs.mkdirSync(newRoot, { recursive: true });
      fs.writeFileSync(path.join(newRoot, 'comics-now.db'), '');
      const { status, body } = await api(h2.baseUrl, '/api/settings', {
        method: 'PUT',
        body: { comicsNowRoot: newRoot }
      });
      expect(status).toBe(200);
      expect(body.warnings.join(' ')).toMatch(/COMICS_NOW_ROOT/);
      // effective config still points at the env root
      expect(body.settings.comicsNowRoot).toBe(h2.root);
      // the file records the requested root for when the env var goes away
      expect(JSON.parse(fs.readFileSync(h2.configPath, 'utf8')).comicsNowRoot).toBe(newRoot);
    } finally {
      await h2.close();
    }
  });

  it('PUT drops stale path pins so the new root re-derives them', async () => {
    // Seed pins that merely repeat what the old root derived — the split-brain
    // hazard: keeping them would leave dbPath/sidecars on the old install.
    fs.writeFileSync(h.configPath, JSON.stringify({
      comicsNowRoot: h.root,
      dbPath: path.join(h.root, 'comics-now.db'),
      guidedViewDir: path.join(h.root, 'metadata', 'guided_view'),
      bind: '0.0.0.0'
    }));

    const newRoot = path.join(h.dir, 'new-root');
    fs.mkdirSync(newRoot, { recursive: true });
    fs.writeFileSync(path.join(newRoot, 'comics-now.db'), '');

    const { status, body } = await api(h.baseUrl, '/api/settings', {
      method: 'PUT',
      body: { comicsNowRoot: newRoot }
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.settings.comicsNowRoot).toBe(newRoot);
    expect(body.settings.dbPath).toBe(path.join(newRoot, 'comics-now.db'));
    expect(body.settings.guidedViewDir).toBe(path.join(newRoot, 'metadata', 'guided_view'));
    expect(body.warnings.join(' ')).toMatch(/stale path keys/);

    const onDisk = JSON.parse(fs.readFileSync(h.configPath, 'utf8'));
    expect(onDisk).toEqual({ comicsNowRoot: newRoot, bind: '0.0.0.0' });
  });

  it('PUT rejects a custom path pin and leaves the file untouched', async () => {
    const custom = JSON.stringify({
      comicsNowRoot: h.root,
      dbPath: path.join(h.dir, 'shared.db')
    });
    fs.writeFileSync(h.configPath, custom);

    const newRoot = path.join(h.dir, 'other-new-root');
    fs.mkdirSync(newRoot, { recursive: true });
    fs.writeFileSync(path.join(newRoot, 'comics-now.db'), '');

    const { status, body } = await api(h.baseUrl, '/api/settings', {
      method: 'PUT',
      body: { comicsNowRoot: newRoot }
    });
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.errors.join(' ')).toContain('dbPath');
    expect(fs.readFileSync(h.configPath, 'utf8')).toBe(custom);
  });
});
