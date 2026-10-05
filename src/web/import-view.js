'use strict';

// Import flow: pick an export file, auto-score candidates, confirm (or pick
// another comic), then apply as attach or replace.

function createImportView(el, { api, onOpenEditor } = {}) {
  const state = { fileData: null, candidates: [], selectedId: null, mode: 'attach' };

  el.textContent = '';

  const fileRow = document.createElement('div');
  fileRow.className = 'import-file-row';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.className = 'import-file';
  fileRow.appendChild(fileInput);

  const status = document.createElement('div');
  status.className = 'import-status';

  const content = document.createElement('div');
  content.className = 'import-content';

  el.append(fileRow, status, content);

  function candidateLabel(candidate) {
    const c = candidate.comic;
    return c.series ? `${c.series} — ${c.name}` : c.name;
  }

  function renderCandidates() {
    const listDiv = document.createElement('div');
    listDiv.className = 'candidate-list';
    state.candidates.forEach((candidate) => {
      const row = document.createElement('div');
      row.className = 'candidate-row';
      row.dataset.id = candidate.comic.id;

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'candidate';
      radio.value = candidate.comic.id;
      radio.checked = state.selectedId === candidate.comic.id;
      radio.addEventListener('change', () => {
        if (radio.checked) state.selectedId = candidate.comic.id;
      });

      const label = document.createElement('span');
      label.className = 'candidate-label';
      label.textContent = candidateLabel(candidate);

      const score = document.createElement('span');
      score.className = 'candidate-score';
      score.textContent = Number(candidate.score).toFixed(2);

      row.append(radio, label, score);

      if (candidate.sourceComicIdMatch) {
        const match = document.createElement('span');
        match.className = 'source-match';
        match.textContent = 'source id match';
        row.appendChild(match);
      }

      const breakdown = document.createElement('span');
      breakdown.className = 'breakdown';
      breakdown.textContent = Object.entries(candidate.breakdown || {})
        .map(([key, value]) => `${key} ${Number(value).toFixed(2)}`)
        .join(' · ');
      row.appendChild(breakdown);

      listDiv.appendChild(row);
    });
    return listDiv;
  }

  function renderModes() {
    const modes = document.createElement('div');
    modes.className = 'mode-row';
    for (const mode of ['attach', 'replace']) {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'import-mode';
      radio.value = mode;
      radio.checked = state.mode === mode;
      radio.addEventListener('change', () => {
        if (radio.checked) state.mode = mode;
      });
      label.append(radio, document.createTextNode(mode === 'attach' ? ' attach (keep other pages)' : ' replace (wipe existing sidecar pages)'));
      modes.appendChild(label);
    }
    return modes;
  }

  function renderManualSearch() {
    const wrap = document.createElement('div');
    wrap.className = 'manual-search';
    const input = document.createElement('input');
    input.className = 'manual-input';
    input.type = 'search';
    input.placeholder = 'Choose a different comic…';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Search';
    const results = document.createElement('div');
    results.className = 'manual-results';

    button.addEventListener('click', async () => {
      results.textContent = '';
      try {
        const data = await api.listComics({ q: input.value.trim() });
        for (const comic of data.comics || []) {
          const row = document.createElement('div');
          row.className = 'manual-row';
          const label = document.createElement('span');
          label.textContent = comic.series ? `${comic.series} — ${comic.name}` : comic.name;
          const pick = document.createElement('button');
          pick.type = 'button';
          pick.className = 'pick';
          pick.textContent = 'Score & select';
          pick.addEventListener('click', async () => {
            try {
              const res = await api.scoreAgainst(state.fileData, comic.id);
              const entry = {
                comic: { ...comic, mangaMode: res.mangaMode },
                score: res.score,
                sourceComicIdMatch: res.sourceComicIdMatch,
                breakdown: res.breakdown
              };
              state.candidates = [entry, ...state.candidates.filter((c) => c.comic.id !== comic.id)];
              state.selectedId = comic.id;
              renderConfirm();
            } catch (err) {
              status.textContent = err.message;
            }
          });
          row.append(label, pick);
          results.appendChild(row);
        }
      } catch (err) {
        status.textContent = err.message;
      }
    });

    wrap.append(input, button, results);
    return wrap;
  }

  function renderConfirm() {
    content.textContent = '';
    const source = document.createElement('div');
    source.className = 'import-source';
    source.textContent = `Import file: ${state.fileData.comic.fileName || state.fileData.comic.series || '(unnamed)'} (${state.fileData.type})`;

    const apply = document.createElement('button');
    apply.className = 'apply';
    apply.type = 'button';
    apply.textContent = 'Apply import';
    apply.addEventListener('click', doApply);

    content.append(source, renderCandidates(), renderModes(), apply, renderManualSearch());
  }

  function renderResult(res) {
    content.textContent = '';
    const result = document.createElement('div');
    result.className = 'import-result';
    const s = res.summary || {};
    const line = document.createElement('div');
    line.textContent =
      `Done. exact: ${s.exact || 0} · case-insensitive: ${s.ci || 0} · basename: ${s.basename || 0} · ` +
      `positional: ${s.positional || 0} · dropped: ${s.dropped || 0} · empty targets: ${s.emptyTarget || 0} · ` +
      `scaled: ${s.scaled || 0} · clamped: ${s.clamped || 0}`;
    result.appendChild(line);
    if (res.backupPath) {
      const backup = document.createElement('div');
      backup.textContent = `Backup: ${res.backupPath}`;
      result.appendChild(backup);
    }
    if (res.sidecarPath) {
      const sidecar = document.createElement('div');
      sidecar.textContent = `Sidecar: ${res.sidecarPath}`;
      result.appendChild(sidecar);
    }
    for (const warning of res.warnings || []) {
      const w = document.createElement('div');
      w.className = 'import-warning';
      w.textContent = warning;
      result.appendChild(w);
    }
    if (onOpenEditor && state.selectedId) {
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open in editor';
      open.addEventListener('click', () => onOpenEditor(state.selectedId));
      result.appendChild(open);
    }
    content.appendChild(result);
  }

  async function doApply() {
    const checked = el.querySelector('input[name="candidate"]:checked');
    if (checked) state.selectedId = checked.value;
    const modeEl = el.querySelector('input[name="import-mode"]:checked');
    if (modeEl) state.mode = modeEl.value;
    if (!state.fileData || !state.selectedId) return;

    status.textContent = 'Applying…';
    try {
      const res = await api.applyImport(state.fileData, state.selectedId, state.mode);
      status.textContent = '';
      renderResult(res);
    } catch (err) {
      status.textContent = `Apply failed: ${err.message}`;
    }
  }

  async function loadFile(data) {
    state.fileData = data;
    content.textContent = '';
    status.textContent = 'Scoring against library…';
    try {
      const scored = await api.scoreImport(data);
      state.candidates = scored.candidates || [];
      state.selectedId = state.candidates.length ? state.candidates[0].comic.id : null;
      state.mode = 'attach';
      status.textContent = '';
      renderConfirm();
    } catch (err) {
      status.textContent = err.message;
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await loadFile(data);
    } catch (err) {
      status.textContent = `Could not read file: ${err.message}`;
    }
  });

  return { loadFile };
}

module.exports = { createImportView };
