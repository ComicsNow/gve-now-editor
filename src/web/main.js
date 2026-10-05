'use strict';

// App shell: view switching + editor orchestration.

const { api } = require('./api');
const { createStore } = require('./editor/store');
const { createUndoStack } = require('./editor/undo');
const { createStage } = require('./editor/stage');
const { attachKeyboard } = require('./editor/keyboard');
const { renderInspector } = require('./editor/inspector');
const { renderOrderPanel } = require('./editor/order-panel');
const { translateBox, remapPoints } = require('./editor/interact');
const { fitWidthScale } = require('./editor/view-math');
const { boxKey } = require('../shared/box');
const { geometryOrder } = require('../shared/reading-order');
const { pruneWesternPanels } = require('../shared/sidecar');
const { createLibraryView } = require('./library-view');
const { createImportView } = require('./import-view');
const { createSettingsView } = require('./settings-view');

const $ = (id) => document.getElementById(id);

const el = {
  library: $('library-view'),
  import: $('import-view'),
  settings: $('settings-view'),
  editor: $('editor-view'),
  toolbar: $('editor-toolbar'),
  pageList: $('page-list'),
  stageContainer: $('stage-container'),
  orderPanel: $('order-panel'),
  inspector: $('inspector'),
  toast: $('toast'),
  dirtyFlag: $('dirty-flag'),
  navLibrary: $('nav-library'),
  navImport: $('nav-import'),
  navSettings: $('nav-settings')
};

const store = createStore();
const undo = createUndoStack();
let session = null;
let stage = null;
let toastTimer = null;

// ---------- view switching ----------

function showView(name) {
  el.library.hidden = name !== 'library';
  el.import.hidden = name !== 'import';
  el.settings.hidden = name !== 'settings';
  el.editor.hidden = name !== 'editor';
  el.navLibrary.classList.toggle('active', name === 'library');
  el.navImport.classList.toggle('active', name === 'import');
  el.navSettings.classList.toggle('active', name === 'settings');
}

function toast(message, kind = 'info') {
  el.toast.textContent = message;
  el.toast.className = `toast toast-${kind}`;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 6000);
}

function updateDirty() {
  el.dirtyFlag.hidden = !store.isDirty();
}

// ---------- editor state ----------

function pushSnapshot() {
  if (!session) return;
  undo.push(store.snapshot());
  updateUndoButtons();
}

function applySnapshot(snap) {
  if (store.getCurrentPage() !== snap.page) store.setCurrentPage(snap.page);
  store.restore(snap);
  const page = store.getPage();
  const ids = new Set(page.items.map((i) => i.id));
  session.selection = new Set([...session.selection].filter((id) => ids.has(id)));
  stage.setSelected(session.selection);
  updateUndoButtons();
}

function doUndo() {
  if (!session) return;
  const snap = undo.undo(store.snapshot());
  if (snap) applySnapshot(snap);
}

function doRedo() {
  if (!session) return;
  const snap = undo.redo(store.snapshot());
  if (snap) applySnapshot(snap);
}

function updateUndoButtons() {
  const undoTarget = el.toolbar.querySelector('.undo');
  const redoTarget = el.toolbar.querySelector('.redo');
  if (undoTarget) undoTarget.disabled = !undo.canUndo();
  if (redoTarget) redoTarget.disabled = !undo.canRedo();
}

function handleSelect(id, { additive } = {}) {
  if (!session) return;
  if (!id) session.selection.clear();
  else if (additive) {
    if (session.selection.has(id)) session.selection.delete(id);
    else session.selection.add(id);
  } else {
    session.selection = new Set([id]);
  }
  stage.setSelected(session.selection);
  renderInspectorPanel();
}

// Free-drawn vertices follow their box. Remap is affine, so incremental
// updates during a drag compose exactly; values stay float until save().
function shapeFor(item, box) {
  return item && item.points ? remapPoints(item.points, item.box, box) : undefined;
}

function handleAdd(kind, box, points) {
  if (!session) return;
  pushSnapshot();
  const at = session.caret;
  const id = store.addItem(kind, box, at, points);
  // Western: panels are scaffold that only orders the bubbles — a page stops
  // showing them the moment it has a bubble, so drop them right away rather
  // than letting them trail the numbering until save.
  const page = store.getPage();
  const pruned = pruneWesternPanels(page, store.getType());
  if (pruned !== page) {
    const keep = new Set(pruned.items.map((i) => i.id));
    store.removeItems(page.items.filter((i) => !keep.has(i.id)).map((i) => i.id));
  }
  // Pruning may have shifted the caret's neighborhood; anchor it after the new
  // item wherever it landed.
  session.caret = store.getPage().order.indexOf(id) + 1;
  session.selection = new Set([id]);
  stage.setSelected(session.selection);
  renderInspectorPanel();
}

function handleUpdateBox(id, box) {
  const page = store.getPage();
  const item = page && page.items.find((i) => i.id === id);
  store.updateItem(id, box, shapeFor(item, box));
}

function handleBeginEdit() {
  pushSnapshot();
}

// Typed position (1-based) from an order-row badge or an on-page badge.
function handleSetNumber(id, number) {
  if (!session) return;
  pushSnapshot();
  store.moveItem(id, number - 1);
}

function setMode(mode) {
  if (!session) return;
  session.mode = mode;
  stage.setMode(mode);
  for (const btn of el.toolbar.querySelectorAll('.mode-btn')) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }
}

function nudgeSelection(dx, dy, step) {
  const page = store.getPage();
  if (!session || !page || !session.selection.size) return;
  pushSnapshot();
  for (const id of session.selection) {
    const item = page.items.find((i) => i.id === id);
    if (item) {
      const box = translateBox(item.box, dx * step, dy * step, page, { clamp: false });
      store.updateItem(id, box, shapeFor(item, box));
    }
  }
}

function deleteSelection() {
  if (!session || !session.selection.size) return;
  pushSnapshot();
  store.removeItems([...session.selection]);
  session.selection.clear();
  stage.setSelected(session.selection);
  renderInspectorPanel();
}

function autoSort() {
  const page = store.getPage();
  if (!page || !page.items.length) return;
  pushSnapshot();
  const panels = page.items.filter((i) => i.kind === 'panel').map((i) => i.box);
  const bubbles = page.items.filter((i) => i.kind === 'bubble').map((i) => i.box);
  const grouped = geometryOrder(panels, bubbles, store.getType());
  const byKey = new Map(page.items.map((i) => [boxKey(i.box), i.id]));
  const next = [];
  for (const entry of grouped) {
    const id = byKey.get(boxKey(entry.box));
    if (id && !next.includes(id)) next.push(id);
  }
  for (const item of page.items) if (!next.includes(item.id)) next.push(item.id);
  store.setOrder(next);
}

// ---------- rendering ----------

function renderAll() {
  if (!session || !stage) return;
  const page = store.getPage();
  if (page) {
    const width = page.width || 1000;
    const height = page.height || 1500;
    stage.setPage({ width, height, type: store.getType(), items: page.items, order: page.order });
    stage.setSelected(session.selection);
  }
  renderOrder();
  renderInspectorPanel();
  updateDirty();
}

function renderOrder() {
  const page = store.getPage();
  renderOrderPanel(el.orderPanel, {
    order: page ? page.order : [],
    items: page ? page.items : [],
    caret: session && session.caret >= 0 ? session.caret : null,
    onSelect: handleSelect,
    onMove: (id, delta) => {
      pushSnapshot();
      store.moveItemBy(id, delta);
    },
    onDrop: (id, toIndex) => {
      pushSnapshot();
      store.moveItem(id, toIndex);
    },
    onSetNumber: handleSetNumber,
    onSetCaret: (index) => {
      if (session) session.caret = index;
      renderOrder();
    }
  });
}

function renderInspectorPanel() {
  const page = store.getPage();
  const ids = session ? [...session.selection] : [];
  const item = page && ids.length === 1 ? page.items.find((i) => i.id === ids[0]) : null;
  const badge = item && page ? page.order.indexOf(item.id) + 1 : null;
  renderInspector(el.inspector, {
    item,
    badge,
    onBoxChange: (box) => {
      if (!item) return;
      pushSnapshot();
      store.updateItem(item.id, box, shapeFor(item, box));
    },
    onDelete: deleteSelection
  });
}

function renderPageList() {
  el.pageList.textContent = '';
  const head = document.createElement('div');
  head.className = 'pane-head';
  head.textContent = `Pages (${session.pageNames.length})`;
  el.pageList.appendChild(head);

  session.pageNames.forEach((name, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-btn' + (name === store.getCurrentPage() ? ' current' : '');
    const page = store.getPage(name);
    const count = page ? page.items.length : 0;
    btn.textContent = `${index + 1}. ${name} (${count})`;
    btn.addEventListener('click', () => showPage(name));
    el.pageList.appendChild(btn);
  });
}

function fitView(page) {
  const viewportWidth = el.stageContainer.clientWidth || 1000;
  const scale = Math.min(1.5, fitWidthScale(viewportWidth - 24, page.width || 1000));
  stage.setView({ scale, offsetX: 12, offsetY: 12 });
}

function showPage(name) {
  store.setCurrentPage(name);
  const page = store.getPage();
  stage.setImage(api.pageImageUrl(session.comicId, name));
  fitView(page);
  renderPageList();
  renderAll();
}

// ---------- toolbar ----------

function buildToolbar() {
  el.toolbar.textContent = '';

  const title = document.createElement('div');
  title.className = 'editor-title';
  const c = session.comic || {};
  title.textContent = c.series ? `${c.series} — ${c.name}` : c.name || session.comicId;
  const typeChip = document.createElement('span');
  typeChip.className = `chip type-${store.getType()}`;
  typeChip.textContent = store.getType();
  title.appendChild(typeChip);

  const modes = document.createElement('div');
  modes.className = 'mode-group';
  // Western pages never author panels: they are detector scaffold for the
  // bubble order, dropped as soon as a page has a bubble.
  const modeDefs = [
    ['select', 'Select'],
    ['panel', 'Draw panel'],
    ['bubble', 'Draw bubble'],
    ['panel-free', 'Free-draw panel'],
    ['bubble-free', 'Free-draw bubble']
  ].filter(([mode]) => store.getType() !== 'western' || !mode.startsWith('panel'));
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
    make('export', 'Export', () => window.open(api.exportUrl(session.comicId), '_blank')),
    make('reset', 'Reset sidecar', resetSidecar),
    make('back', '← Library', () => {
      if (confirmLeave()) showView('library');
    })
  );

  el.toolbar.append(title, modes, actions);
  updateUndoButtons();
}

// ---------- save / reset ----------

async function save() {
  if (!session) return;
  const pages = {};
  for (const [name, page] of Object.entries(store.getDoc().pages)) {
    pages[name] = {
      width: page.width,
      height: page.height,
      items: page.items.map((i) => {
        const out = { id: i.id, kind: i.kind, box: i.box.map(Math.round) };
        if (i.points) out.points = i.points.map(([x, y]) => [Math.round(x), Math.round(y)]);
        return out;
      }),
      order: [...page.order]
    };
  }
  try {
    const res = await api.saveGuided(session.comicId, {
      comicId: store.getComicId(),
      type: store.getType(),
      pages
    });
    store.markSaved();
    toast(`Saved. Backup: ${res.backupPath || '(none)'}`, 'info');
    for (const warning of res.warnings || []) toast(warning, 'warn');
  } catch (err) {
    toast(`Save failed: ${err.message}`, 'error');
  }
}

async function resetSidecar() {
  if (!session) return;
  if (!window.confirm('Delete the guided-view sidecar for this comic? (a backup is kept)')) return;
  try {
    await api.resetGuided(session.comicId);
    toast('Sidecar removed (backup kept).', 'info');
    await openComic(session.comicId);
  } catch (err) {
    toast(`Reset failed: ${err.message}`, 'error');
  }
}

// ---------- session ----------

function ensureStage() {
  if (stage) return;
  stage = createStage(el.stageContainer, {
    onAdd: handleAdd,
    onSelect: handleSelect,
    onUpdateBox: handleUpdateBox,
    onBeginEdit: handleBeginEdit,
    onEditNumber: handleSetNumber
  });
  stage.imgEl.addEventListener('load', () => {
    const page = store.getPage();
    if (page && (!page.width || !page.height) && stage.imgEl.naturalWidth) {
      page.width = stage.imgEl.naturalWidth;
      page.height = stage.imgEl.naturalHeight;
      renderAll();
    }
  });
  window.addEventListener('resize', () => {
    const page = store.getPage();
    if (session && page) fitView(page);
  });
}

async function openComic(id) {
  try {
    const [doc, info] = await Promise.all([api.guided(id), api.getComic(id)]);
    ensureStage();
    session = {
      comicId: id,
      comic: info.comic,
      pageNames: Object.keys(doc.pages),
      selection: new Set(),
      caret: -1,
      mode: 'select'
    };
    store.load({ comicId: doc.comicId, type: doc.type, pages: doc.pages });
    undo.clear();
    stage.setMode('select');
    showView('editor');
    buildToolbar();
    showPage(store.getCurrentPage());
    if (doc.warnings && doc.warnings.length) {
      toast(`${doc.warnings.length} normalization warning(s) on load — first: ${doc.warnings[0]}`, 'warn');
    }
  } catch (err) {
    toast(`Open failed: ${err.message}`, 'error');
  }
}

function confirmLeave() {
  return !store.isDirty() || window.confirm('Discard unsaved changes?');
}

// ---------- boot ----------

function boot() {
  createLibraryView(el.library, {
    api,
    onOpen: openComic,
    onExport: (id) => window.open(api.exportUrl(id), '_blank')
  });
  createImportView(el.import, { api, onOpenEditor: openComic });
  const settingsView = createSettingsView(el.settings, { api });

  el.navLibrary.addEventListener('click', () => {
    if (confirmLeave()) showView('library');
  });
  el.navImport.addEventListener('click', () => {
    if (confirmLeave()) showView('import');
  });
  el.navSettings.addEventListener('click', () => {
    if (!confirmLeave()) return;
    showView('settings');
    // Re-read: the config file may have changed since the last visit.
    settingsView.refresh();
  });

  attachKeyboard(document.body, {
    onNudge: nudgeSelection,
    onDelete: () => {
      // While free-drawing, Backspace/Delete undoes the last vertex.
      if (stage && stage.isFreeDrawing()) stage.popFreeVertex();
      else deleteSelection();
    },
    onEnter: () => {
      if (stage && stage.isFreeDrawing()) stage.closeFreeDraw();
    },
    onUndo: doUndo,
    onRedo: doRedo,
    onEscape: () => {
      if (stage && stage.isFreeDrawing()) {
        stage.cancelFreeDraw();
        return;
      }
      if (!session) return;
      setMode('select');
      session.selection.clear();
      stage.setSelected(session.selection);
      renderInspectorPanel();
    }
  });

  store.onChange(() => {
    if (session) renderAll();
  });

  window.addEventListener('beforeunload', (e) => {
    if (store.isDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  showView('library');
}

boot();
