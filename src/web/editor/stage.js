'use strict';

// Stage: viewport > stage (W x H native px, transformed) > img + overlay.
// All pointer math goes through interact.js; this module is the wiring.

const { renderOverlay } = require('./overlay');
const { pointerToNative, boxFromPoints, resizeBox, translateBox, polygonBox, MIN_BOX_SIZE } = require('./interact');
const { zoomAt, resolveView } = require('./view-math');

// Exponential zoom per wheel unit: a trackpad pinch (small deltas) is smooth,
// a mouse ctrl+wheel notch (~100) is a comfortable step.
const ZOOM_SENSITIVITY = 1.0015;
const PAN_CLICK_SLOP = 3; // px of movement below which an empty press counts as a click
const FREE_CLOSE_RADIUS = 10; // screen px around the first vertex that closes a polygon
const SVG_NS = 'http://www.w3.org/2000/svg';

function createStage(container, handlers = {}) {
  let page = { width: 0, height: 0, type: 'western', items: [], order: [] };
  let view = { scale: 1, offsetX: 0, offsetY: 0 };
  let mode = 'select';
  let selected = new Set();
  let drag = null;
  // Free-draw draft: { kind, points: [[x,y], ...] (native px), cursor }.
  let freeDraft = null;

  const viewport = document.createElement('div');
  viewport.className = 'stage-viewport';
  const stageEl = document.createElement('div');
  stageEl.className = 'stage';
  const img = document.createElement('img');
  img.className = 'stage-img';
  img.draggable = false;
  const layer = document.createElement('div');
  layer.className = 'stage-overlay';
  const freeLayer = document.createElementNS(SVG_NS, 'svg');
  freeLayer.setAttribute('class', 'free-layer');

  stageEl.appendChild(img);
  stageEl.appendChild(layer);
  stageEl.appendChild(freeLayer);
  viewport.appendChild(stageEl);
  container.appendChild(viewport);

  function applyView() {
    stageEl.style.transform = `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`;
    // Screen-constant chrome: CSS sizes borders/badges/handles in --invpx units
    // (2 * var(--invpx) renders as 2 screen px at any zoom).
    if (view.scale > 0) stageEl.style.setProperty('--invpx', `${1 / view.scale}px`);
  }

  // Every view change goes through here: resolved against the viewport so the
  // page stays pinned (centered / edge-clamped) and zoom stays in range.
  function setViewInternal(next) {
    view = resolveView(next, viewport.clientWidth, viewport.clientHeight, page.width, page.height);
    applyView();
  }

  function render() {
    renderOverlay(layer, {
      page,
      order: page.order,
      selected,
      onSelect: (id, opts) => {
        if (mode === 'select' && handlers.onSelect) handlers.onSelect(id, opts);
      },
      // Number editing is a select-mode affordance; while drawing, badges stay inert.
      onEditNumber: mode === 'select' ? handlers.onEditNumber : undefined
    });
  }

  function getNative(clientX, clientY) {
    return pointerToNative(clientX, clientY, stageEl.getBoundingClientRect(), page.width, page.height);
  }

  // ---------- free-draw (polygon) drawing ----------

  function clampFree(p) {
    return [Math.max(0, Math.min(p.x, page.width)), Math.max(0, Math.min(p.y, page.height))];
  }

  function renderFreeDraft() {
    freeLayer.textContent = '';
    if (!freeDraft) return;
    const pts = freeDraft.points;
    if (pts.length >= 2) {
      const line = document.createElementNS(SVG_NS, 'polyline');
      line.setAttribute('class', 'free-line');
      const chain = pts.map(([x, y]) => `${x},${y}`);
      chain.push(`${freeDraft.cursor[0]},${freeDraft.cursor[1]}`); // rubber band to the cursor
      line.setAttribute('points', chain.join(' '));
      freeLayer.appendChild(line);
    }
    pts.forEach(([x, y], i) => {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', i === 0 ? 'free-vertex free-vertex-start' : 'free-vertex');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      freeLayer.appendChild(dot);
    });
  }

  // Click adds a vertex; a click within FREE_CLOSE_RADIUS screen px of the
  // first vertex closes the polygon.
  function freePointerDown(start) {
    const p = clampFree(start);
    if (!freeDraft) {
      freeDraft = { kind: mode === 'panel-free' ? 'panel' : 'bubble', points: [p], cursor: p };
      renderFreeDraft();
      return;
    }
    const [fx, fy] = freeDraft.points[0];
    if (freeDraft.points.length >= 3 && Math.hypot(p[0] - fx, p[1] - fy) * view.scale <= FREE_CLOSE_RADIUS) {
      closeFreeDraw();
      return;
    }
    freeDraft.points.push(p);
    freeDraft.cursor = p;
    renderFreeDraft();
  }

  function cancelFreeDraw() {
    if (!freeDraft) return;
    freeDraft = null;
    renderFreeDraft();
  }

  // Enter / clicking the first vertex: commit when there is a real polygon.
  function closeFreeDraw() {
    if (!freeDraft || freeDraft.points.length < 3) return false;
    const kind = freeDraft.kind;
    const points = freeDraft.points.map(([x, y]) => [Math.round(x), Math.round(y)]);
    const box = polygonBox(points);
    cancelFreeDraw();
    if (box[2] >= MIN_BOX_SIZE && box[3] >= MIN_BOX_SIZE && handlers.onAdd) {
      handlers.onAdd(kind, box, points);
    }
    return true;
  }

  // Backspace: drop the last vertex (cancelling once none are left).
  function popFreeVertex() {
    if (!freeDraft) return false;
    freeDraft.points.pop();
    if (freeDraft.points.length === 0) {
      freeDraft = null;
    } else {
      freeDraft.cursor = freeDraft.points[freeDraft.points.length - 1];
    }
    renderFreeDraft();
    return true;
  }

  stageEl.addEventListener('pointermove', (e) => {
    if (!freeDraft) return;
    const p = getNative(e.clientX, e.clientY);
    freeDraft.cursor = [p.x, p.y]; // unclamped: the rubber band may leave the page
    renderFreeDraft();
  });

  function onWindowMove(e) {
    if (!drag) return;
    const p = getNative(e.clientX, e.clientY);

    if (drag.kind === 'move') {
      const box = translateBox(drag.origBox, p.x - drag.start.x, p.y - drag.start.y, page).map(Math.round);
      if (handlers.onUpdateBox) handlers.onUpdateBox(drag.id, box);
    } else if (drag.kind === 'resize') {
      const box = resizeBox(drag.origBox, drag.handle, p.x - drag.start.x, p.y - drag.start.y, page).map(Math.round);
      if (handlers.onUpdateBox) handlers.onUpdateBox(drag.id, box);
    } else if (drag.kind === 'pan') {
      if (Math.abs(e.clientX - drag.startClientX) > PAN_CLICK_SLOP || Math.abs(e.clientY - drag.startClientY) > PAN_CLICK_SLOP) {
        drag.moved = true;
      }
      view = {
        scale: view.scale,
        offsetX: drag.origView.offsetX + (e.clientX - drag.startClientX),
        offsetY: drag.origView.offsetY + (e.clientY - drag.startClientY)
      };
      applyView();
    } else if (drag.kind === 'marquee' && drag.ghost) {
      const rect = viewport.getBoundingClientRect();
      drag.ghost.style.left = `${Math.min(drag.startClientX, e.clientX) - rect.left}px`;
      drag.ghost.style.top = `${Math.min(drag.startClientY, e.clientY) - rect.top}px`;
      drag.ghost.style.width = `${Math.abs(e.clientX - drag.startClientX)}px`;
      drag.ghost.style.height = `${Math.abs(e.clientY - drag.startClientY)}px`;
    }
  }

  function onWindowUp(e) {
    if (!drag) return;
    const finished = drag;
    drag = null;
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onWindowUp);

    if (finished.kind === 'marquee') {
      if (finished.ghost) finished.ghost.remove();
      const p = getNative(e.clientX, e.clientY);
      const box = boxFromPoints(finished.start.x, finished.start.y, p.x, p.y).map(Math.round);
      box[0] = Math.max(0, Math.min(box[0], page.width));
      box[1] = Math.max(0, Math.min(box[1], page.height));
      box[2] = Math.max(0, Math.min(box[2], page.width - box[0]));
      box[3] = Math.max(0, Math.min(box[3], page.height - box[1]));
      if (box[2] >= MIN_BOX_SIZE && box[3] >= MIN_BOX_SIZE && handlers.onAdd) {
        handlers.onAdd(finished.kindOf, box);
      }
    } else if (finished.kind === 'pan' && !finished.moved && handlers.onSelect) {
      handlers.onSelect(null, { additive: false });
    }
  }

  stageEl.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const target = e.target;
    const boxEl = target.closest ? target.closest('.box') : null;
    const handleEl = target.closest ? target.closest('.handle') : null;
    const start = getNative(e.clientX, e.clientY);

    if (mode === 'panel-free' || mode === 'bubble-free') {
      e.preventDefault();
      freePointerDown(start);
      return;
    }

    if (mode === 'select') {
      if (boxEl && handleEl) {
        const item = page.items.find((i) => i.id === boxEl.dataset.id);
        if (!item) return;
        e.preventDefault();
        if (handlers.onBeginEdit) handlers.onBeginEdit(item.id);
        drag = { kind: 'resize', id: item.id, handle: handleEl.dataset.handle, origBox: [...item.box], start };
      } else if (boxEl) {
        const item = page.items.find((i) => i.id === boxEl.dataset.id);
        if (!item) return;
        e.preventDefault();
        // Select on press: the pointerdown->drag re-render replaces the box
        // element, so the trailing click that normally selects never fires.
        // Shift stays with the click handler (additive toggle) and an existing
        // selection is kept so multi-select survives a drag.
        if (handlers.onSelect && !selected.has(item.id) && !e.shiftKey) handlers.onSelect(item.id, { additive: false });
        if (handlers.onBeginEdit) handlers.onBeginEdit(item.id);
        drag = { kind: 'move', id: item.id, origBox: [...item.box], start };
      } else {
        drag = {
          kind: 'pan',
          startClientX: e.clientX,
          startClientY: e.clientY,
          origView: { ...view },
          moved: false
        };
      }
    } else {
      e.preventDefault();
      const ghost = document.createElement('div');
      ghost.className = 'marquee';
      viewport.appendChild(ghost);
      drag = {
        kind: 'marquee',
        kindOf: mode,
        start,
        startClientX: e.clientX,
        startClientY: e.clientY,
        ghost
      };
    }

    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
  });

  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        // Trackpad pinch (browsers send ctrl+wheel) or mouse ctrl+wheel: zoom
        // anchored at the cursor. zoomAt's pointer coordinates are in the
        // stage's pre-transform frame: the cursor position relative to the
        // stage's parent, i.e. rect.left minus the translate.
        const rect = stageEl.getBoundingClientRect();
        setViewInternal(
          zoomAt(view, e.clientX - rect.left + view.offsetX, e.clientY - rect.top + view.offsetY, Math.pow(ZOOM_SENSITIVITY, -e.deltaY))
        );
      } else {
        // Plain wheel / two-finger scroll: pan.
        setViewInternal({
          scale: view.scale,
          offsetX: view.offsetX - e.deltaX,
          offsetY: view.offsetY - e.deltaY
        });
      }
    },
    { passive: false }
  );

  applyView();

  function setPage(next) {
    page = {
      width: next.width,
      height: next.height,
      type: next.type || 'western',
      items: next.items || [],
      order: next.order || (next.items || []).map((i) => i.id)
    };
    stageEl.style.width = `${page.width}px`;
    stageEl.style.height = `${page.height}px`;
    freeLayer.setAttribute('viewBox', `0 0 ${page.width} ${page.height}`);
    cancelFreeDraw();
    render();
  }

  return {
    viewport,
    stageEl,
    layerEl: layer,
    freeLayerEl: freeLayer,
    imgEl: img,
    setPage,
    setImage(src) {
      img.src = src;
    },
    setView(next) {
      setViewInternal({ ...next });
    },
    getView: () => ({ ...view }),
    setMode(next) {
      mode = next;
      cancelFreeDraw();
      render(); // re-gate mode-dependent overlay affordances (select / number edit)
    },
    getMode: () => mode,
    isFreeDrawing: () => freeDraft !== null,
    cancelFreeDraw,
    popFreeVertex,
    closeFreeDraw,
    setSelected(next) {
      selected = next || new Set();
      render();
    },
    render,
    getNative
  };
}

module.exports = { createStage };
