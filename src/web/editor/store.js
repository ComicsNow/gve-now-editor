'use strict';

// Editor document state. One page is current at a time; every mutation marks
// the document dirty and notifies subscribers. Item ids are editor-session
// only and never persisted.

function copyPoints(points) {
  return points.map(([x, y]) => [x, y]);
}

// Deep copy of one item, including polygon vertices when present.
function copyItem(item) {
  const copy = { ...item, box: [...item.box] };
  if (item.points) copy.points = copyPoints(item.points);
  return copy;
}

function createStore() {
  let doc = { comicId: null, type: 'western', pages: {} };
  let currentPage = null;
  let dirty = false;
  let idCounter = 0;
  const listeners = new Set();

  function notify() {
    for (const fn of [...listeners]) fn();
  }

  function page(name = currentPage) {
    return name != null ? doc.pages[name] || null : null;
  }

  function requirePage(name = currentPage) {
    const p = page(name);
    if (!p) throw new Error(`unknown page: ${name}`);
    return p;
  }

  function moveItem(id, toIndex, name = currentPage) {
    const p = requirePage(name);
    const from = p.order.indexOf(id);
    if (from < 0) return false;
    const next = p.order.slice();
    next.splice(from, 1);
    const idx = Math.max(0, Math.min(toIndex, next.length));
    next.splice(idx, 0, id);
    p.order = next;
    dirty = true;
    notify();
    return true;
  }

  return {
    getDoc: () => doc,
    getComicId: () => doc.comicId,
    getType: () => doc.type,
    getPages: () => Object.keys(doc.pages),
    getCurrentPage: () => currentPage,
    getPage: (name = currentPage) => page(name),
    isDirty: () => dirty,

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    load(next) {
      doc = next;
      const names = Object.keys(doc.pages);
      currentPage = names.length ? names[0] : null;
      idCounter = 0;
      dirty = false;
      notify();
    },

    setCurrentPage(name) {
      if (!doc.pages[name]) throw new Error(`unknown page: ${name}`);
      currentPage = name;
      notify();
    },

    // Insert a new item; atIndex < 0 appends to the order. `points` (free-draw
    // vertices) is stored only when given, keeping rect-only saves minimal.
    addItem(kind, box, atIndex = -1, points) {
      const p = requirePage();
      const id = `n${++idCounter}`;
      const item = { id, kind, box: [...box] };
      if (points) item.points = copyPoints(points);
      p.items.push(item);
      const idx = atIndex < 0 || atIndex > p.order.length ? p.order.length : atIndex;
      p.order.splice(idx, 0, id);
      dirty = true;
      notify();
      return id;
    },

    // `points`: undefined keeps the item's shape, an array replaces it, null
    // clears it (back to a plain rect).
    updateItem(id, box, points, name = currentPage) {
      const p = requirePage(name);
      const item = p.items.find((i) => i.id === id);
      if (!item) return false;
      item.box = [...box];
      if (points === null) delete item.points;
      else if (points !== undefined) item.points = copyPoints(points);
      dirty = true;
      notify();
      return true;
    },

    removeItems(ids, name = currentPage) {
      const p = requirePage(name);
      const kill = new Set(ids);
      const before = p.items.length;
      p.items = p.items.filter((i) => !kill.has(i.id));
      p.order = p.order.filter((id) => !kill.has(id));
      const removed = before - p.items.length;
      if (removed) {
        dirty = true;
        notify();
      }
      return removed;
    },

    moveItem,

    moveItemBy(id, delta, name = currentPage) {
      const p = requirePage(name);
      const from = p.order.indexOf(id);
      if (from < 0) return false;
      return moveItem(id, from + delta, name);
    },

    // Replace the whole order; must be a permutation of the current items.
    setOrder(order, name = currentPage) {
      const p = requirePage(name);
      const ids = new Set(p.items.map((i) => i.id));
      const seen = new Set();
      for (const id of order) {
        if (!ids.has(id) || seen.has(id)) return false;
        seen.add(id);
      }
      if (seen.size !== ids.size) return false;
      p.order = [...order];
      dirty = true;
      notify();
      return true;
    },

    // Deep copy of the current page (for the undo stack).
    snapshot(name = currentPage) {
      const p = requirePage(name);
      return {
        page: name,
        width: p.width,
        height: p.height,
        items: p.items.map(copyItem),
        order: [...p.order]
      };
    },

    restore(snap) {
      doc.pages[snap.page] = {
        width: snap.width,
        height: snap.height,
        items: snap.items.map(copyItem),
        order: [...snap.order]
      };
      if (!doc.pages[currentPage]) currentPage = snap.page;
      dirty = true;
      notify();
    },

    markSaved() {
      dirty = false;
      notify();
    }
  };
}

module.exports = { createStore };
