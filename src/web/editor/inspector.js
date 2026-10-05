'use strict';

// Metrics panel for the selected box: x/y/w/h number inputs and a Delete
// button (the button is the only way to delete on touch devices — the
// Delete/Backspace shortcut needs a keyboard).

const FIELD_INDEX = { x: 0, y: 1, w: 2, h: 3 };

function renderInspector(el, { item, badge, onBoxChange, onDelete } = {}) {
  el.textContent = '';

  if (!item) {
    const empty = document.createElement('div');
    empty.className = 'inspector-empty';
    empty.textContent = 'No selection';
    el.appendChild(empty);
    return;
  }

  const head = document.createElement('div');
  head.className = 'inspector-head';
  head.textContent = `${item.kind} #${badge}`;
  el.appendChild(head);

  for (const field of ['x', 'y', 'w', 'h']) {
    const row = document.createElement('label');
    row.className = 'inspector-row';
    row.textContent = field;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'metric-input';
    input.dataset.field = field;
    input.value = String(item.box[FIELD_INDEX[field]]);
    input.addEventListener('change', () => {
      const raw = input.value.trim();
      const value = Number(raw);
      if (raw === '' || !Number.isFinite(value)) return;
      const box = [...item.box];
      box[FIELD_INDEX[field]] = value;
      if (onBoxChange) onBoxChange(box, field);
    });

    row.appendChild(input);
    el.appendChild(row);
  }

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'inspector-delete';
  del.textContent = 'Delete';
  del.title = 'Delete selected box (Del)';
  del.addEventListener('click', () => {
    if (onDelete) onDelete();
  });
  el.appendChild(del);
}

module.exports = { renderInspector, FIELD_INDEX };
