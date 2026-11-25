'use strict';

function updateUndoButtons(toolbarEl, undo) {
  if (!toolbarEl || !undo) return;
  const undoTarget = toolbarEl.querySelector('.undo');
  const redoTarget = toolbarEl.querySelector('.redo');
  if (undoTarget) undoTarget.disabled = !undo.canUndo();
  if (redoTarget) redoTarget.disabled = !undo.canRedo();
}

function buildToolbar(toolbarEl, {
  session,
  storeType,
  undo,
  setMode,
  doUndo,
  doRedo,
  autoSort,
  save,
  onExport,
  resetSidecar,
  onBack
} = {}) {
  toolbarEl.textContent = '';

  const title = document.createElement('div');
  title.className = 'editor-title';
  const c = (session && session.comic) || {};
  title.textContent = c.series ? `${c.series} — ${c.name}` : c.name || (session && session.comicId) || '';
  const typeChip = document.createElement('span');
  typeChip.className = `chip type-${storeType}`;
  typeChip.textContent = storeType;
  title.appendChild(typeChip);

  const modes = document.createElement('div');
  modes.className = 'mode-group';
  const modeDefs = [
    ['select', 'Select'],
    ['panel', 'Draw panel'],
    ['bubble', 'Draw bubble'],
    ['panel-free', 'Free-draw panel'],
    ['bubble-free', 'Free-draw bubble']
  ].filter(([mode]) => storeType !== 'western' || !mode.startsWith('panel'));
  for (const [mode, label] of modeDefs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mode-btn';
    btn.dataset.mode = mode;
    btn.textContent = label;
    if (mode === 'select') btn.classList.add('active');
    btn.addEventListener('click', () => setMode(mode));
    modes.appendChild(btn);
  }

  const actions = document.createElement('div');
  actions.className = 'action-group';
  const make = (cls, label, onClick, titleText) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    btn.textContent = label;
    if (titleText) btn.title = titleText;
    btn.addEventListener('click', onClick);
    return btn;
  };

  actions.append(
    make('undo', 'Undo', doUndo),
    make('redo', 'Redo', doRedo),
    make('autosort', 'Re-sort by geometry', autoSort),
    make('save', 'Save', save),
    make('export', 'Export', onExport),
    make('reset', 'Reset sidecar', resetSidecar),
    make('back', '← Library', onBack)
  );

  toolbarEl.append(title, modes, actions);
  updateUndoButtons(toolbarEl, undo);
}

module.exports = { buildToolbar, updateUndoButtons };
