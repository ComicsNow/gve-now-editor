'use strict';

const { translateBox, remapPoints } = require('./interact');
const { getPageItem } = require('./store');
const { pruneWesternPanels } = require('../../shared/sidecar');

function shapeFor(item, box) {
  return item && item.points ? remapPoints(item.points, item.box, box) : undefined;
}

function nudgeSelection({ session, store, dx, dy, step, pushSnapshot }) {
  const page = store.getPage();
  if (!session || !page || !session.selection.size) return;
  pushSnapshot();
  for (const id of session.selection) {
    const item = getPageItem(page, id);
    if (item) {
      const box = translateBox(item.box, dx * step, dy * step, page, { clamp: false });
      store.updateItem(id, box, shapeFor(item, box));
    }
  }
}

function deleteSelection({ session, store, stage, renderInspectorPanel, pushSnapshot }) {
  if (!session || !session.selection.size) return;
  pushSnapshot();
  store.removeItems([...session.selection]);
  session.selection.clear();
  stage.setSelected(session.selection);
  renderInspectorPanel();
}

function handleAddBox({ session, store, stage, kind, box, points, pushSnapshot, renderInspectorPanel }) {
  if (!session) return;
  pushSnapshot();
  const at = session.caret;
  const id = store.addItem(kind, box, at, points);
  const page = store.getPage();
  const pruned = pruneWesternPanels(page, store.getType());
  if (pruned !== page) {
    const keep = new Set(pruned.items.map((i) => i.id));
    store.removeItems(page.items.filter((i) => !keep.has(i.id)).map((i) => i.id));
  }
  session.caret = store.getPage().order.indexOf(id) + 1;
  session.selection = new Set([id]);
  stage.setSelected(session.selection);
  renderInspectorPanel();
}

module.exports = { shapeFor, nudgeSelection, deleteSelection, handleAddBox };
