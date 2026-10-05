'use strict';

// Settings: point GVE Now! at a different comics-now install. The server
// validates the candidate path (the database must exist), persists it to
// config.json and tells us a restart is needed.

const RESOLVED_ROWS = [
  ['comicsNowRoot', 'Comics Now! root'],
  ['dbPath', 'Database'],
  ['guidedViewDir', 'Guided view dir'],
  ['backupDir', 'Backup dir'],
  ['pageCacheDir', 'Page cache dir'],
  ['port', 'Port'],
  ['bind', 'Bind address']
];

function createSettingsView(el, { api }) {
  el.textContent = '';

  const title = document.createElement('div');
  title.className = 'settings-title';
  title.textContent = 'Settings';

  const intro = document.createElement('p');
  intro.className = 'settings-intro';
  intro.textContent =
    'Where GVE Now! finds the comics-now install (its database, guided-view sidecars and page cache).';

  const form = document.createElement('form');
  form.className = 'settings-form';
  const field = document.createElement('label');
  field.className = 'settings-field';
  const fieldText = document.createElement('span');
  fieldText.className = 'settings-field-label';
  fieldText.textContent = 'Comics Now! install location';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'settings-path-input';
  input.placeholder = '/opt/comics-now';
  input.spellcheck = false;
  field.append(fieldText, input);

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'settings-save';
  save.textContent = 'Save';
  form.append(field, save);

  const status = document.createElement('div');
  status.className = 'settings-status';

  const envNotice = document.createElement('div');
  envNotice.className = 'settings-env-notice';
  envNotice.hidden = true;

  const restart = document.createElement('div');
  restart.className = 'settings-restart';
  restart.hidden = true;

  const resolved = document.createElement('div');
  resolved.className = 'settings-resolved';

  el.append(title, intro, form, status, envNotice, restart, resolved);

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = kind ? `settings-status settings-status-${kind}` : 'settings-status';
  }

  function renderResolved(settings) {
    resolved.textContent = '';
    for (const [key, label] of RESOLVED_ROWS) {
      if (settings[key] === undefined) continue;
      const row = document.createElement('div');
      row.className = 'settings-row';
      row.dataset.key = key;
      const name = document.createElement('span');
      name.className = 'settings-row-label';
      name.textContent = label;
      const value = document.createElement('span');
      value.className = 'settings-row-value';
      value.textContent = String(settings[key]);
      row.append(name, value);
      resolved.appendChild(row);
    }
  }

  function showEnvNotice() {
    envNotice.hidden = false;
    envNotice.textContent =
      'COMICS_NOW_ROOT is set in the service environment and overrides config.json — the app keeps using that value until the variable is unset.';
  }

  function showRestart(message) {
    restart.hidden = false;
    restart.textContent = message || 'Restart GVE Now! to apply (sudo systemctl restart gve-now)';
  }

  async function refresh() {
    setStatus('Loading…');
    try {
      const data = await api.getSettings();
      if (data.settings) {
        renderResolved(data.settings);
        input.value = data.settings.comicsNowRoot || '';
      }
      if (data.env && data.env.comicsNowRoot) showEnvNotice();
      const errors = (data.validation && data.validation.errors) || [];
      const warnings = (data.validation && data.validation.warnings) || [];
      if (errors.length) setStatus(errors.join('\n'), 'error');
      else if (warnings.length) setStatus(warnings.join('\n'), 'warn');
      else setStatus(`Config file: ${data.configPath}`, 'ok');
      return data;
    } catch (err) {
      setStatus(`Failed to load settings: ${err.message}`, 'error');
      return null;
    }
  }

  async function saveSettings() {
    const comicsNowRoot = input.value.trim();
    if (!comicsNowRoot) {
      setStatus('Enter the comics-now install path first.', 'error');
      return;
    }
    restart.hidden = true;
    setStatus('Saving…');
    try {
      const res = await api.saveSettings({ comicsNowRoot });
      if (res.settings) renderResolved(res.settings);
      const warnings = res.warnings || [];
      if (warnings.some((warning) => warning.includes('COMICS_NOW_ROOT'))) showEnvNotice();
      setStatus(warnings.length ? warnings.join('\n') : 'Saved.', warnings.length ? 'warn' : 'ok');
      showRestart(res.message);
    } catch (err) {
      setStatus(`Save failed: ${err.message}`, 'error');
    }
  }

  save.addEventListener('click', saveSettings);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettings();
  });

  refresh();

  return { refresh, input, saveSettings };
}

module.exports = { createSettingsView };
