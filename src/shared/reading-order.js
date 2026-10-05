'use strict';

const { isBubbleInPanel, intersectionOverArea, WESTERN_BUBBLE_IOA, PARENT_IOA } = require('./box');

// Geometry sort used by comics-now's detector (server/services/panel-detector.js:223).
// Western: y*5 + x (row-major Z-pattern); manga: y*1.5 - (x + w) (right-to-left rows).
function sortReadingOrder(boxes, type) {
  if (!Array.isArray(boxes)) return boxes;
  const sorted = boxes.slice();
  if (type === 'manga') {
    sorted.sort((a, b) => (a[1] * 1.5 - (a[0] + a[2])) - (b[1] * 1.5 - (b[0] + b[2])));
  } else {
    sorted.sort((a, b) => (a[1] * 5 + a[0]) - (b[1] * 5 + b[0]));
  }
  return sorted;
}

// Geometry-based reading order matching the detector's grouping intent
// (panel-detector.js buildHybridWesternSequence / buildMangaSequence):
// western emits each panel then its bubbles (first panel to claim a bubble wins);
// manga emits each panel's bubbles then the panel itself. Orphans come last.
// Returns [{kind, box}].
function geometryOrder(panels, bubbles, type) {
  const allPanels = Array.isArray(panels) ? panels : [];
  const allBubbles = Array.isArray(bubbles) ? bubbles : [];
  if (type === 'manga') {
    return mangaGeometryOrder(sortReadingOrder(allPanels, 'manga'), sortReadingOrder(allBubbles, 'manga'));
  }
  return westernGeometryOrder(sortReadingOrder(allPanels, 'western'), sortReadingOrder(allBubbles, 'western'));
}

function westernGeometryOrder(sortedPanels, sortedBubbles) {
  const out = [];
  const assigned = new Set();
  for (const panel of sortedPanels) {
    out.push({ kind: 'panel', box: panel });
    for (const bubble of sortedBubbles) {
      if (assigned.has(bubble)) continue;
      if (isBubbleInPanel(bubble, panel) || intersectionOverArea(bubble, panel) >= WESTERN_BUBBLE_IOA) {
        assigned.add(bubble);
        out.push({ kind: 'bubble', box: bubble });
      }
    }
  }
  for (const bubble of sortedBubbles) {
    if (!assigned.has(bubble)) out.push({ kind: 'bubble', box: bubble });
  }
  return out;
}

function mangaGeometryOrder(sortedPanels, sortedBubbles) {
  const out = [];
  const owner = new Map(); // bubble -> first panel (in reading order) with IoA >= 0.6
  for (const bubble of sortedBubbles) {
    for (const panel of sortedPanels) {
      if (intersectionOverArea(bubble, panel) >= PARENT_IOA) {
        owner.set(bubble, panel);
        break;
      }
    }
  }
  for (const panel of sortedPanels) {
    for (const bubble of sortedBubbles) {
      if (owner.get(bubble) === panel) out.push({ kind: 'bubble', box: bubble });
    }
    out.push({ kind: 'panel', box: panel });
  }
  for (const bubble of sortedBubbles) {
    if (!owner.has(bubble)) out.push({ kind: 'bubble', box: bubble });
  }
  return out;
}

module.exports = { sortReadingOrder, geometryOrder };
