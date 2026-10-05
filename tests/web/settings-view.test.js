/**
 * @jest-environment jsdom
 */
const { createSettingsView } = require('../../src/web/settings-view');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function settingsResponse(overrides = {}) {
  return {
    ok: true,
    configPath: '/opt/gve-now/config.json',
    settings: {
      comicsNowRoot: '/opt/comics-now',
      dbPath: '/opt/comics-now/comics-now.db',
      guidedViewDir: '/opt/comics-now/metadata/guided_view',
      backupDir: '/opt/comics-now/metadata/guided_view/.backups',
      pageCacheDir: '/opt/comics-now/page-cache',
      port: 3100,
      bind: '0.0.0.0'
    },
    env: { comicsNowRoot: false, port: false, bind: false },
    validation: { errors: [], warnings: [] },
    ...overrides
  };
}

function makeApi(overrides = {}) {
  return {
    getSettings: jest.fn(async () => settingsResponse()),
    saveSettings: jest.fn(async () => ({
      ok: true,
      restartRequired: true,
      message: 'Restart GVE Now! to apply (sudo systemctl restart gve-now)',
      settings: {
        comicsNowRoot: '/srv/comics',
        dbPath: '/srv/comics/comics-now.db',
        guidedViewDir: '/srv/comics/metadata/guided_view',
        backupDir: '/srv/comics/metadata/guided_view/.backups',
        pageCacheDir: '/srv/comics/page-cache',
        port: 3100,
        bind: '0.0.0.0'
      },
      warnings: []
    })),
    ...overrides
  };
}

describe('web/settings-view', () => {
  it('renders the resolved config from GET /api/settings', async () => {
    const el = document.createElement('div');
    const api = makeApi();
    createSettingsView(el, { api });
    await flush();

    expect(api.getSettings).toHaveBeenCalledTimes(1);
    const resolved = el.querySelector('.settings-resolved').textContent;
    expect(resolved).toContain('/opt/comics-now');
    expect(resolved).toContain('/opt/comics-now/comics-now.db');
    expect(resolved).toContain('3100');
    expect(resolved).toContain('0.0.0.0');
    expect(el.querySelector('.settings-path-input').value).toBe('/opt/comics-now');
    expect(el.querySelector('.settings-env-notice').hidden).toBe(true);
    expect(el.querySelector('.settings-restart').hidden).toBe(true);
  });

  it('saves the typed path and shows the restart hint', async () => {
    const el = document.createElement('div');
    const api = makeApi();
    createSettingsView(el, { api });
    await flush();

    el.querySelector('.settings-path-input').value = '/srv/comics';
    el.querySelector('.settings-save').click();
    await flush();

    expect(api.saveSettings).toHaveBeenCalledWith({ comicsNowRoot: '/srv/comics' });
    expect(el.querySelector('.settings-status').textContent).toMatch(/saved/i);
    expect(el.querySelector('.settings-resolved').textContent).toContain('/srv/comics');

    const restart = el.querySelector('.settings-restart');
    expect(restart.hidden).toBe(false);
    expect(restart.textContent).toContain('systemctl restart gve-now');
  });

  it('shows validation errors when the save fails', async () => {
    const el = document.createElement('div');
    const api = makeApi({
      saveSettings: jest.fn(async () => {
        const err = new Error('comics-now database not found: /nope/comics-now.db');
        err.status = 400;
        err.data = { errors: ['comics-now database not found: /nope/comics-now.db'] };
        throw err;
      })
    });
    createSettingsView(el, { api });
    await flush();

    el.querySelector('.settings-path-input').value = '/nope';
    el.querySelector('.settings-save').click();
    await flush();

    expect(el.querySelector('.settings-status').textContent).toContain('database not found: /nope/comics-now.db');
    expect(el.querySelector('.settings-restart').hidden).toBe(true);
  });

  it('shows the env-override notice when COMICS_NOW_ROOT is set', async () => {
    const el = document.createElement('div');
    const api = makeApi();
    api.getSettings.mockResolvedValue(
      settingsResponse({ env: { comicsNowRoot: true, port: false, bind: false } })
    );
    createSettingsView(el, { api });
    await flush();

    const notice = el.querySelector('.settings-env-notice');
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain('COMICS_NOW_ROOT');
  });

  it('surfaces a load failure inline', async () => {
    const el = document.createElement('div');
    const api = makeApi({ getSettings: jest.fn(async () => { throw new Error('boom'); }) });
    createSettingsView(el, { api });
    await flush();

    expect(el.querySelector('.settings-status').textContent).toContain('boom');
  });
});
