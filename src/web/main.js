'use strict';

// App shell: view switching + editor orchestration.

const { api } = require('./api');
const { createStore, getPageItem } = require('./editor/store');
const { createUndoStack } = require('./editor/undo');
const { createStage } = require('./editor/stage');
const { renderInspector } = require('./editor/inspector');
const { renderOrderPanel } = require('./editor/order-panel');
const { fitWidthScale } = require('./editor/view-math');
const { sortItemIdsByGeometry } = require('./editor/reading-sort');
const { buildToolbar, updateUndoButtons } = require('./editor/toolbar');
const { renderPageList } = require('./editor/page-list');
const { serializeEditorPages } = require('./editor/serializer');
const { shapeFor, nudgeSelection, deleteSelection, handleAddBox } = require('./editor/selection-ops');
const { bindEditorKeyboard } = require('./editor-keyboard');
const { createViewRouter, createToast } = require('./views');
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

const router = createViewRouter(
  { library: el.library, import: el.import, settings: el.settings, editor: el.editor },
  { library: el.navLibrary, import: el.navImport, settings: el.navSettings }
);
const showView = router.showView;
const toast = createToast(el.toast);

function updateDirty() {
  el.dirtyFlag.hidden = !store.isDirty();
}

function updateUndoButtonsState() {
  updateUndoButtons(el.toolbar, undo);
}

function pushSnapshot() {
  if (!session) return;
  undo.push(store.snapshot());
  updateUndoButtonsState();
}

function applySnapshot(snap) {
  if (store.getCurrentPage() !== snap.page) store.setCurrentPage(snap.page);
  store.restore(snap);
  const page = store.getPage();
  const ids = new Set(page.items.map((i) => i.id));
  session.selection = new Set([...session.selection].filter((id) => ids.has(id)));
  stage.setSelected(session.selection);
  updateUndoButtonsState();
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

function handleAdd(kind, box, points) {
  handleAddBox({
    session,
    store,
    stage,
    kind,
    box,
    points,
    pushSnapshot,
    renderInspectorPanel
  });
}

function handleUpdateBox(id, box) {
  const page = store.getPage();
  const item = getPageItem(page, id);
  store.updateItem(id, box, shapeFor(item, box));
}

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

function autoSort() {
  const page = store.getPage();
  if (!page || !page.items.length) return;
  pushSnapshot();
  const next = sortItemIdsByGeometry(page.items, store.getType());
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
  const item = page && ids.length === 1 ? getPageItem(page, ids[0]) : null;
  const badge = item && page ? page.order.indexOf(item.id) + 1 : null;
  renderInspector(el.inspector, {
    item,
    badge,
    onBoxChange: (box) => {
      if (!item) return;
      pushSnapshot();
      store.updateItem(item.id, box, shapeFor(item, box));
    },
    onDelete: () => deleteSelection({ session, store, stage, renderInspectorPanel, pushSnapshot })
  });
}

function renderPageListPane() {
  renderPageList(el.pageList, {
    pageNames: session ? session.pageNames : [],
    currentPage: store.getCurrentPage(),
    getPage: (name) => store.getPage(name),
    onSelectPage: showPage
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
  renderPageListPane();
  renderAll();
}

function buildToolbarPane() {
  buildToolbar(el.toolbar, {
    session,
    storeType: store.getType(),
    undo,
    setMode,
    doUndo,
    doRedo,
    autoSort,
    save,
    onExport: () => window.open(api.exportUrl(session.comicId), '_blank'),
    resetSidecar,
    onBack: () => {
      if (confirmLeave()) showView('library');
    }
  });
}

// ---------- save / reset ----------

async function save() {
  if (!session) return;
  const pages = serializeEditorPages(store.getDoc().pages);
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
    onBeginEdit: pushSnapshot,
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
    buildToolbarPane();
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
    settingsView.refresh();
  });

  bindEditorKeyboard({
    target: document.body,
    stageGetter: () => stage,
    sessionGetter: () => session,
    nudgeSelection: (dx, dy, step) => nudgeSelection({ session, store, dx, dy, step, pushSnapshot }),
    deleteSelection: () => deleteSelection({ session, store, stage, renderInspectorPanel, pushSnapshot }),
    doUndo,
    doRedo,
    setMode,
    renderInspectorPanel
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
