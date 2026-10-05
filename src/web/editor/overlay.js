'use strict';

// Box rendering for the stage. Boxes are absolutely positioned in native page
// px inside the stage element, so the stage transform handles all scaling.

const { openBadgeEditor } = require('./badge-edit');

const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const SVG_NS = 'http://www.w3.org/2000/svg';

// Free-drawn items render as an SVG polygon in box-relative coordinates. The
// svg spans the bbox (overflow visible, so a vertex just outside a clamped
// bbox still draws); CSS keeps the stroke screen-constant and the svg
// click-through so the div stays the drag target.
function appendShape(div, item) {
  div.classList.add('has-shape');
  const [x, y, w, h] = item.box;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'shape-svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const poly = document.createElementNS(SVG_NS, 'polygon');
  poly.setAttribute('class', `shape shape-${item.kind}`);
  poly.setAttribute('points', item.points.map(([px, py]) => `${px - x},${py - y}`).join(' '));
  svg.appendChild(poly);
  div.appendChild(svg);
}

function renderOverlay(layer, { page, order, selected = new Set(), onSelect, onEditNumber } = {}) {
  layer.textContent = '';
  const items = page && page.items ? page.items : [];
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const ids = order || items.map((i) => i.id);

  ids.forEach((id, index) => {
    const item = itemsById.get(id);
    if (!item) return;

    const div = document.createElement('div');
    div.className = `box box-${item.kind}`;
    div.dataset.id = id;
    if (selected.has(id)) div.classList.add('selected');
    div.style.left = `${item.box[0]}px`;
    div.style.top = `${item.box[1]}px`;
    div.style.width = `${item.box[2]}px`;
    div.style.height = `${item.box[3]}px`;
    div.title = `${item.kind} ${item.box.join(', ')}`;

    if (item.points && item.points.length >= 3) appendShape(div, item);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(index + 1);
    if (onEditNumber) {
      badge.title = 'Click to set position';
      badge.addEventListener('pointerdown', (e) => e.stopPropagation()); // no box drag from the number
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        openBadgeEditor(badge, { value: index + 1, max: ids.length, onCommit: (n) => onEditNumber(id, n) });
      });
    }
    div.appendChild(badge);

    if (selected.has(id)) {
      for (const dir of HANDLE_DIRS) {
        const handle = document.createElement('div');
        handle.className = `handle handle-${dir}`;
        handle.dataset.handle = dir;
        div.appendChild(handle);
      }
    }

    div.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onSelect) onSelect(id, { additive: !!e.shiftKey });
    });

    layer.appendChild(div);
  });
}

module.exports = { renderOverlay, HANDLE_DIRS };
