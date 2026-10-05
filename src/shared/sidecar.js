'use strict';

// Guided-view sidecar normalization and canonical regeneration.
// Format: {comicId, type, pages: {<CBZ entry name>: {panels, bubbles, sequence}}}.
// Boxes are [x, y, w, h] absolute integer px, top-left origin; order = array index.

const { roundBox, boxesEqual, boxKey, intersectionOverArea, isBubbleInPanel, CHILD_IOA, WESTERN_BUBBLE_IOA } = require('./box');

function normalizeBox(v) {
  if (Array.isArray(v)) {
    return v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? roundBox(v) : null;
  }
  if (v && typeof v === 'object') {
    const vals = [v[0], v[1], v[2], v[3]];
    if (vals.every((n) => typeof n === 'number' && Number.isFinite(n))) return roundBox(vals);
  }
  return null;
}

// Free-draw vertices: a valid entry is an array of at least 3 finite [x, y]
// pairs; anything else degrades to null (plain rect). Rounded like boxes.
function normalizePoints(v) {
  if (!Array.isArray(v) || v.length < 3) return null;
  const out = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const [x, y] = p;
    if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) return null;
    out.push([Math.round(x), Math.round(y)]);
  }
  return out;
}

// Legacy manga classification (public/js/viewer/guided/geometry.js classifyMangaPage):
// a box is a bubble when >= 70% of its area lies inside any other box.
function classifyMangaChild(box, boxes) {
  return boxes.some((other) => other !== box && intersectionOverArea(box, other) >= CHILD_IOA);
}

// Match sequence boxes against items by exact box equality (first unused match wins).
function matchSequence(items, seqBoxes) {
  const used = new Set();
  const seqPos = new Map();
  let dropped = 0;
  for (let s = 0; s < seqBoxes.length; s++) {
    let hit = null;
    for (const item of items) {
      if (used.has(item.id)) continue;
      if (boxesEqual(item.box, seqBoxes[s])) {
        hit = item;
        break;
      }
    }
    if (hit) {
      used.add(hit.id);
      seqPos.set(hit.id, s);
    } else {
      dropped++;
    }
  }
  return { seqPos, dropped };
}

// Western bubble order: the sequence IS the reading order — on a worked-out
// page the reader steps exactly these boxes. Bubbles the sequence never
// references are appended in stored order; sequence boxes matching nothing are
// counted as dropped. Without a sequence the stored order stands.
function westernBubbleOrder(items, seqBoxes, warnings) {
  if (seqBoxes.length === 0) {
    warnings.push('no-sequence');
    return items.map((i) => i.id);
  }
  const m = matchSequence(items, seqBoxes);
  if (m.dropped > 0) warnings.push('dropped-sequence-boxes');
  const out = [...m.seqPos.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  let appended = 0;
  for (const item of items) {
    if (!m.seqPos.has(item.id)) {
      out.push(item.id);
      appended++;
    }
  }
  if (appended > 0) warnings.push('appended-items');
  return out;
}

// Western panel display order — used for bubble-less pages, where the reader
// steps the panels themselves (sequence === panels). Panels in sequence order
// (unmatched panels in stored order), each panel followed by its bubbles
// (assignment: centre-in-panel or IoA >= 0.8, bubble sub-order from the
// sequence), orphan bubbles last. Pages with bubbles never reach this.
function westernDisplayOrder(items, seqBoxes, warnings) {
  const panels = items.filter((i) => i.kind === 'panel');
  const bubbles = items.filter((i) => i.kind === 'bubble');
  const stored = new Map(items.map((i, idx) => [i.id, idx]));
  let seqPos = new Map();
  if (seqBoxes.length === 0) {
    warnings.push('no-sequence');
  } else {
    const m = matchSequence(items, seqBoxes);
    seqPos = m.seqPos;
    if (m.dropped > 0) warnings.push('dropped-sequence-boxes');
  }
  const key = (item) => (seqPos.has(item.id) ? seqPos.get(item.id) : Number.MAX_SAFE_INTEGER);
  const bySeq = (a, b) => (key(a) - key(b)) || (stored.get(a.id) - stored.get(b.id));

  const out = [];
  const assigned = new Set();
  for (const panel of panels.slice().sort(bySeq)) {
    out.push(panel.id);
    const children = [];
    for (const bubble of bubbles) {
      if (assigned.has(bubble.id)) continue;
      if (isBubbleInPanel(bubble.box, panel.box) || intersectionOverArea(bubble.box, panel.box) >= WESTERN_BUBBLE_IOA) {
        children.push(bubble);
        assigned.add(bubble.id);
      }
    }
    children.sort(bySeq);
    for (const child of children) out.push(child.id);
  }
  let appended = 0;
  for (const orphan of bubbles.filter((b) => !assigned.has(b.id)).sort(bySeq)) {
    out.push(orphan.id);
    if (!seqPos.has(orphan.id)) appended++;
  }
  if (appended > 0) warnings.push('appended-items');
  return out;
}

// Manga display order: flattened sequence (matched one-to-one by box), unmatched
// items appended in stored order.
function mangaDisplayOrder(items, seqBoxes, warnings) {
  if (seqBoxes.length === 0) {
    warnings.push('no-sequence');
    return items.map((i) => i.id);
  }
  const m = matchSequence(items, seqBoxes);
  const entries = [...m.seqPos.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  const matched = new Set(entries);
  const appended = items.map((i) => i.id).filter((id) => !matched.has(id));
  if (m.dropped > 0) warnings.push('dropped-sequence-boxes');
  if (appended.length > 0) warnings.push('appended-items');
  return entries.concat(appended);
}

// Normalize one sidecar page into editor items + display order.
// Manga: `panels` is a raw mixed set; split it using the legacy classification, unless
// the page carries explicit `bubbles` (editor-written) which are authoritative.
function normalizeSidecarPage(value, type) {
  const warnings = [];
  const items = [];
  const push = (kind, box, points) => {
    const item = { id: 'i' + items.length, kind, box };
    if (points) item.points = points;
    items.push(item);
  };

  if (Array.isArray(value)) {
    warnings.push('bare-array');
    for (const raw of value) {
      const box = normalizeBox(raw);
      if (box) push('panel', box);
    }
    return { items, order: items.map((i) => i.id), warnings };
  }

  const page = value && typeof value === 'object' ? value : {};
  const rawPanels = Array.isArray(page.panels) ? page.panels : [];
  const rawBubbles = Array.isArray(page.bubbles) ? page.bubbles : [];
  const rawPanelPoints = Array.isArray(page.panelPoints) ? page.panelPoints : [];
  const rawBubblePoints = Array.isArray(page.bubblePoints) ? page.bubblePoints : [];
  const seqBoxes = (Array.isArray(page.sequence) ? page.sequence : []).map(normalizeBox).filter(Boolean);

  if (type === 'manga') {
    // Index-based so vertex arrays stay aligned with their raw boxes even when
    // a malformed box is dropped.
    const boxes = [];
    const boxPoints = [];
    const bubbles = [];
    const bubblePoints = [];
    for (let i = 0; i < rawPanels.length; i++) {
      const box = normalizeBox(rawPanels[i]);
      if (box) {
        boxes.push(box);
        boxPoints.push(normalizePoints(rawPanelPoints[i]));
      }
    }
    for (let i = 0; i < rawBubbles.length; i++) {
      const box = normalizeBox(rawBubbles[i]);
      if (box) {
        bubbles.push(box);
        bubblePoints.push(normalizePoints(rawBubblePoints[i]));
      }
    }
    // Editor-written pages have pure panels and a bubbles list the sequence
    // references (editor regeneration writes sequence = panels + bubbles).
    // Legacy pages can carry an unreferenced bubbles list (a separate detection
    // pass) — the reader keeps the heuristic classification there, so the
    // editor must too, keeping those bubbles as (orphan) bubble items.
    const seqKeys = new Set(seqBoxes.map(boxKey));
    const editorWritten = bubbles.length > 0 && bubbles.every((b) => seqKeys.has(boxKey(b)));
    if (editorWritten) {
      for (let i = 0; i < boxes.length; i++) push('panel', boxes[i], boxPoints[i]);
      for (let i = 0; i < bubbles.length; i++) push('bubble', bubbles[i], bubblePoints[i]);
    } else {
      for (let i = 0; i < boxes.length; i++) push(classifyMangaChild(boxes[i], boxes) ? 'bubble' : 'panel', boxes[i], boxPoints[i]);
      for (let i = 0; i < bubbles.length; i++) push('bubble', bubbles[i], bubblePoints[i]);
    }
    return { items, order: mangaDisplayOrder(items, seqBoxes, warnings), warnings };
  }

  for (let i = 0; i < rawPanels.length; i++) {
    const box = normalizeBox(rawPanels[i]);
    if (box) push('panel', box, normalizePoints(rawPanelPoints[i]));
  }
  for (let i = 0; i < rawBubbles.length; i++) {
    const box = normalizeBox(rawBubbles[i]);
    if (box) push('bubble', box, normalizePoints(rawBubblePoints[i]));
  }
  // On a western page with bubbles the reader steps the bubbles alone
  // (sequence = bubbles) and the panels are detector scaffold that only ever
  // helped order the dialogue — so the editor shows and keeps bubbles only.
  // Bubble-less pages keep their panels: there the reader steps the panels.
  const bubblesOnly = items.filter((i) => i.kind === 'bubble');
  if (bubblesOnly.length > 0) {
    return { items: bubblesOnly, order: westernBubbleOrder(bubblesOnly, seqBoxes, warnings), warnings };
  }
  return { items, order: westernDisplayOrder(items, seqBoxes, warnings), warnings };
}

// Editor-session invariant: a western page stops showing panels the moment it
// has a bubble (see normalizeSidecarPage), so a live session that just gained
// one prunes the scaffold immediately rather than at save time. Pure; returns
// the same page object when there is nothing to drop.
function pruneWesternPanels(page, type) {
  if (type !== 'western') return page;
  const items = Array.isArray(page.items) ? page.items : [];
  if (!items.some((i) => i.kind === 'bubble') || !items.some((i) => i.kind === 'panel')) return page;
  const kept = items.filter((i) => i.kind === 'bubble');
  const keptIds = new Set(kept.map((i) => i.id));
  return { ...page, items: kept, order: (page.order || []).filter((id) => keptIds.has(id)) };
}

function normalizeSidecar(sidecar) {
  const type = sidecar && sidecar.type === 'manga' ? 'manga' : 'western';
  const out = { comicId: sidecar ? sidecar.comicId : null, type, pages: {}, warnings: [] };
  const pagesIn = (sidecar && sidecar.pages) || {};
  for (const name of Object.keys(pagesIn)) {
    const { items, order, warnings } = normalizeSidecarPage(pagesIn[name], type);
    out.pages[name] = { width: null, height: null, items, order };
    for (const w of warnings) out.warnings.push(`${name}: ${w}`);
  }
  return out;
}

// Canonical regeneration — the only writer shape.
// panels = order-projections per kind; sequence = manga: full interleave,
// western: bubbles when present else panels (measured reader convention).
// Free-drawn vertices persist as parallel panelPoints/bubblePoints arrays
// (null for rect items, same index as panels/bubbles), emitted only when at
// least one item has a shape so rect-only pages stay byte-identical to the
// pre-free-draw format. The reader keeps zooming the bbox.
function regeneratePage(page, type) {
  const byId = new Map(page.items.map((i) => [i.id, i]));
  const ordered = page.order.map((id) => byId.get(id)).filter(Boolean);
  const roundPoints = (item) => (item.points ? item.points.map(([x, y]) => [Math.round(x), Math.round(y)]) : null);
  const panelItems = ordered.filter((i) => i.kind === 'panel');
  const bubbleItems = ordered.filter((i) => i.kind === 'bubble');
  const panels = panelItems.map((i) => i.box);
  const bubbles = bubbleItems.map((i) => i.box);
  const out = {
    panels,
    bubbles,
    sequence: type === 'manga' ? ordered.map((i) => i.box) : bubbles.length > 0 ? bubbles : panels
  };
  const panelPoints = panelItems.map(roundPoints);
  if (panelPoints.some(Boolean)) out.panelPoints = panelPoints;
  const bubblePoints = bubbleItems.map(roundPoints);
  if (bubblePoints.some(Boolean)) out.bubblePoints = bubblePoints;
  return out;
}

function regenerateSidecar(doc) {
  const pages = {};
  for (const [name, page] of Object.entries(doc.pages || {})) pages[name] = regeneratePage(page, doc.type);
  return { comicId: doc.comicId, type: doc.type, pages };
}

// Kind + box + shape of every item in display order — the identity of a
// page's content. Points are part of the identity so a shape-only edit still
// forces regeneration.
function pageSignature(items, order) {
  const byId = new Map(items.map((i) => [i.id, i]));
  return JSON.stringify(order.map((id) => {
    const item = byId.get(id);
    const points = item.points ? item.points.map(([x, y]) => [Math.round(x), Math.round(y)]) : null;
    return [item.kind, item.box[0], item.box[1], item.box[2], item.box[3], points];
  }));
}

// Save-time merge. Pages the user did not change are kept verbatim from the
// original sidecar — regeneration would otherwise reorder reader-visible arrays
// (e.g. an interleaved western sequence, legacy raw-mixed manga panels, the
// spread-object sequence form). Only pages whose display-order content changed
// are regenerated canonically. Original pages missing from the document are
// preserved; pages new to the document are regenerated.
function mergeSidecar(doc, original) {
  const originalPages = (original && original.pages) || {};
  const docPages = doc.pages || {};
  const pages = {};
  for (const [name, page] of Object.entries(originalPages)) {
    if (!Object.prototype.hasOwnProperty.call(docPages, name)) {
      pages[name] = page; // not in the document — keep verbatim
      continue;
    }
    const submitted = docPages[name];
    const normalized = normalizeSidecarPage(page, doc.type);
    const changed = pageSignature(submitted.items || [], submitted.order || [])
      !== pageSignature(normalized.items, normalized.order);
    pages[name] = changed ? regeneratePage(submitted, doc.type) : page;
  }
  for (const [name, page] of Object.entries(docPages)) {
    if (!Object.prototype.hasOwnProperty.call(pages, name)) pages[name] = regeneratePage(page, doc.type);
  }
  return { comicId: doc.comicId, type: doc.type, pages };
}

// Structural validation of the editor document before saving.
// Bounds violations are warnings (real sidecars contain e.g. y = -22 boxes),
// everything structural is an error (rejected with 400 on save).
function validateEditorDocument(doc) {
  const errors = [];
  const warnings = [];
  if (!doc || typeof doc !== 'object') {
    errors.push('document must be an object');
    return { errors, warnings };
  }
  if (doc.type !== 'western' && doc.type !== 'manga') errors.push(`invalid type: ${JSON.stringify(doc.type)}`);

  const pages = doc.pages || {};
  for (const [name, page] of Object.entries(pages)) {
    if (!page || typeof page !== 'object') {
      errors.push(`${name}: page must be an object`);
      continue;
    }
    const items = Array.isArray(page.items) ? page.items : null;
    if (!items) {
      errors.push(`${name}: items must be an array`);
      continue;
    }
    const ids = new Set();
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || item.id === '') {
        errors.push(`${name}: item missing id`);
        continue;
      }
      if (ids.has(item.id)) errors.push(`${name}: duplicate item id ${item.id}`);
      ids.add(item.id);
      if (item.kind !== 'panel' && item.kind !== 'bubble') {
        errors.push(`${name}: item ${item.id} has invalid kind ${JSON.stringify(item.kind)}`);
      }
      const box = item.box;
      if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        errors.push(`${name}: box for ${item.id} must be four finite numbers`);
        continue;
      }
      if (box[2] <= 0 || box[3] <= 0) errors.push(`${name}: box for ${item.id} has non-positive size`);
      if (item.points != null) {
        const pts = item.points;
        const valid = Array.isArray(pts) && pts.length >= 3
          && pts.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)));
        if (!valid) errors.push(`${name}: points for ${item.id} must be at least 3 [x, y] finite-number pairs`);
      }
      const W = page.width;
      const H = page.height;
      if (Number.isFinite(W) && Number.isFinite(H) && (box[0] < 0 || box[1] < 0 || box[0] + box[2] > W || box[1] + box[3] > H)) {
        warnings.push(`${name}: box for ${item.id} is out of bounds`);
      }
    }
    const order = Array.isArray(page.order) ? page.order : null;
    if (!order) {
      errors.push(`${name}: order must be an array`);
      continue;
    }
    if (order.length !== items.length || new Set(order).size !== order.length || !order.every((id) => ids.has(id))) {
      errors.push(`${name}: order must be a permutation of item ids`);
    }
  }
  return { errors, warnings };
}

module.exports = {
  normalizeBox,
  normalizeSidecarPage,
  normalizeSidecar,
  regeneratePage,
  regenerateSidecar,
  mergeSidecar,
  pruneWesternPanels,
  validateEditorDocument
};
