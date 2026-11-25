'use strict';

const { boxesEqual } = require('../../shared/box');
const { geometryOrder } = require('../../shared/reading-order');

// Sort item IDs according to detector reading order geometry, preserving
// duplicate/coincident coordinates without collisions.
function sortItemIdsByGeometry(items, type) {
  if (!items || !items.length) return [];
  const panels = items.filter((i) => i.kind === 'panel').map((i) => i.box);
  const bubbles = items.filter((i) => i.kind === 'bubble').map((i) => i.box);
  const grouped = geometryOrder(panels, bubbles, type);
  const matched = new Set();
  const next = [];

  for (const entry of grouped) {
    const item =
      items.find((i) => !matched.has(i.id) && i.kind === entry.kind && boxesEqual(i.box, entry.box)) ||
      items.find((i) => !matched.has(i.id) && boxesEqual(i.box, entry.box));
    if (item) {
      matched.add(item.id);
      next.push(item.id);
    }
  }

  for (const item of items) {
    if (!matched.has(item.id)) next.push(item.id);
  }
  return next;
}

module.exports = { sortItemIdsByGeometry };
