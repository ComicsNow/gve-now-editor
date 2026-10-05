'use strict';

// List math for the order panel (the reading-order sidebar).

const { openBadgeEditor } = require('./badge-edit');

const DRAG_SLOP = 3; // px of movement below which a row press stays a click

// After a drag-reorder the browser still fires a click where the pointer
// landed; swallow exactly that one so a drag never selects. Any new press
// clears the flag, so it can only ever eat the click that follows a drop.
let suppressNextRowClick = false;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    () => {
      suppressNextRowClick = false;
    },
    true
  );
}

// Move the id at `fromIndex` so it ends up at final index `toIndex`.
function reorderIdList(order, fromIndex, toIndex) {
  const next = order.slice();
  if (fromIndex < 0 || fromIndex >= next.length) return next;
  const [id] = next.splice(fromIndex, 1);
  const idx = Math.max(0, Math.min(toIndex, next.length));
  next.splice(idx, 0, id);
  return next;
}

// Convert a drop insertion position (count of row midpoints above the pointer,
// over the full list including the dragged row) into the final index the
// dragged id should occupy once it has been removed.
function dropIndex(fromIndex, insertionIndex) {
  return insertionIndex > fromIndex ? insertionIndex - 1 : insertionIndex;
}

// Badge number per id in display order (1-based).
function nextBadgeNumbers(order) {
  const map = {};
  order.forEach((id, i) => {
    map[id] = i + 1;
  });
  return map;
}

// Caret index for a pointer y over a list of rows: the number of rows whose
// vertical midpoint is above the pointer. 0 = before the first row.
function insertionIndexFromY(rows, y) {
  let index = 0;
  for (const row of rows) {
    if (y > row.top + row.height / 2) index++;
  }
  return index;
}

// DOM rendering of the order list. `caret` is the insertion index for newly
// drawn boxes (a gap between rows). Rows can be dragged to a new position
// (reported via onDrop as the final index), and their badge clicked to type
// a position (onSetNumber, 1-based, clamped to the list).
function renderOrderPanel(el, { order = [], items = [], caret = null, onSelect, onMove, onSetCaret, onDrop, onSetNumber } = {}) {
  el.textContent = '';
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const badges = nextBadgeNumbers(order);

  const list = document.createElement('div');
  list.className = 'order-list';

  function beginRowDrag(row, id, fromIndex, startClientX, startClientY) {
    let moved = false;
    let insertion = -1;

    const rowTops = () =>
      [...list.querySelectorAll('.order-row')].map((r) => {
        const b = r.getBoundingClientRect();
        return { top: b.top, height: b.height };
      });
    const paintDrop = (index) => {
      insertion = index;
      list.querySelectorAll('.caret-slot').forEach((slot) => {
        slot.classList.toggle('drop-slot', Number(slot.dataset.index) === index);
      });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      row.classList.remove('dragging');
      list.querySelectorAll('.caret-slot.drop-slot').forEach((slot) => slot.classList.remove('drop-slot'));
    };
    const onPointerMove = (ev) => {
      if (!moved) {
        if (Math.abs(ev.clientX - startClientX) <= DRAG_SLOP && Math.abs(ev.clientY - startClientY) <= DRAG_SLOP) return;
        moved = true;
        row.classList.add('dragging');
      }
      paintDrop(insertionIndexFromY(rowTops(), ev.clientY));
    };
    const onPointerUp = () => {
      cleanup();
      if (!moved || insertion < 0) return;
      const toIndex = dropIndex(fromIndex, insertion);
      if (toIndex === fromIndex) return;
      suppressNextRowClick = true;
      if (onDrop) onDrop(id, toIndex);
    };
    const onPointerCancel = () => cleanup();

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  }

  const caretSlot = (index) => {
    const slot = document.createElement('div');
    slot.className = 'caret-slot';
    if (caret === index) slot.classList.add('active');
    slot.dataset.index = String(index);
    slot.title = 'New boxes are inserted here';
    slot.addEventListener('click', () => {
      if (onSetCaret) onSetCaret(index);
    });
    return slot;
  };

  list.appendChild(caretSlot(0));
  order.forEach((id, index) => {
    const item = itemsById.get(id);
    if (!item) return;

    const row = document.createElement('div');
    row.className = `order-row row-${item.kind}`;
    row.dataset.id = id;

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(badges[id]);
    badge.title = 'Click to set position';
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onSetNumber) {
        openBadgeEditor(badge, { value: badges[id], max: order.length, onCommit: (n) => onSetNumber(id, n) });
      }
    });

    const chip = document.createElement('span');
    chip.className = `chip chip-${item.kind}`;

    const label = document.createElement('span');
    label.className = 'order-label';
    label.textContent = `${item.box[0]},${item.box[1]} ${item.box[2]}×${item.box[3]}`;

    const up = document.createElement('button');
    up.className = 'move-up';
    up.type = 'button';
    up.textContent = '▲';
    up.title = 'Move earlier';
    up.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onMove) onMove(id, -1);
    });

    const down = document.createElement('button');
    down.className = 'move-down';
    down.type = 'button';
    down.textContent = '▼';
    down.title = 'Move later';
    down.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onMove) onMove(id, 1);
    });

    row.append(badge, chip, label, up, down);
    row.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest && e.target.closest('.move-up, .move-down, .badge')) return;
      beginRowDrag(row, id, index, e.clientX, e.clientY);
    });
    row.addEventListener('click', (e) => {
      if (suppressNextRowClick) {
        suppressNextRowClick = false;
        return;
      }
      if (e.target.closest('.move-up, .move-down')) return;
      if (onSelect) onSelect(id, { additive: !!e.shiftKey });
    });

    list.appendChild(row);
    list.appendChild(caretSlot(index + 1));
  });

  el.appendChild(list);
}

module.exports = { reorderIdList, nextBadgeNumbers, insertionIndexFromY, dropIndex, renderOrderPanel };
