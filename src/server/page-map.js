'use strict';

// Map an export file's pages onto a target comic's archive entries.
// Match priority: exact name -> case-insensitive -> basename -> positional
// (numeric-aware order, same comparator as comics-now's archive-utils.js).
// Boxes are scaled when both sides' dimensions differ by > 1%, then clamped.

function baseName(name) {
  return String(name || '').split('/').pop();
}

function numericCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function scaleBox(box, sx, sy, width, height) {
  let [x, y, w, h] = [Math.round(box[0] * sx), Math.round(box[1] * sy), Math.round(box[2] * sx), Math.round(box[3] * sy)];
  let clamped = false;
  if (x < 0) {
    w += x;
    x = 0;
    clamped = true;
  }
  if (y < 0) {
    h += y;
    y = 0;
    clamped = true;
  }
  if (x + w > width) {
    w = Math.max(0, width - x);
    clamped = true;
  }
  if (y + h > height) {
    h = Math.max(0, height - y);
    clamped = true;
  }
  return { box: [x, y, w, h], clamped };
}

function mapBoxes(boxes, sx, sy, width, height) {
  let clampedCount = 0;
  const out = boxes.map((box) => {
    const r = scaleBox(box, sx, sy, width, height);
    if (r.clamped) clampedCount++;
    return r.box;
  });
  return { boxes: out, clampedCount };
}

// Free-draw vertices scale linearly with their boxes (same factor, no
// clamping — the box clamp above is what bounds the reader's zoom rect; SVG
// overflow is visible, so a vertex just outside the clamped box still draws).
function mapPoints(points, sx, sy) {
  return points.map((pts) => (Array.isArray(pts) ? pts.map(([x, y]) => [Math.round(x * sx), Math.round(y * sy)]) : null));
}

function mapPages({ pages, pageOrder, targetPages, targetDims = {} }) {
  const sourceNames = pageOrder && pageOrder.length > 0 ? pageOrder : Object.keys(pages);
  const byName = new Map(sourceNames.map((name) => [name, name]));
  const byLower = new Map();
  const byBase = new Map();
  for (const name of sourceNames) {
    if (!byLower.has(name.toLowerCase())) byLower.set(name.toLowerCase(), name);
    const base = baseName(name);
    if (!byBase.has(base)) byBase.set(base, name);
  }

  const summary = { exact: 0, ci: 0, basename: 0, positional: 0, dropped: 0, emptyTarget: 0, scaled: 0, clamped: 0 };
  const matchedSources = new Set();
  const result = {};
  const unmatchedTargets = [];

  const attach = (targetName, sourceName, matchType) => {
    const source = pages[sourceName];
    const dims = targetDims[targetName] || null;
    let out = {
      sourceName,
      matchType,
      width: source.width,
      height: source.height,
      panels: source.panels || [],
      bubbles: source.bubbles || [],
      sequence: source.sequence || []
    };
    if (source.panelPoints) out.panelPoints = source.panelPoints;
    if (source.bubblePoints) out.bubblePoints = source.bubblePoints;
    if (dims && Number.isFinite(dims.width) && Number.isFinite(dims.height) && Number.isFinite(source.width) && Number.isFinite(source.height) && source.width > 0 && source.height > 0) {
      const sx = dims.width / source.width;
      const sy = dims.height / source.height;
      if (Math.abs((dims.width - source.width) / source.width) > 0.01 || Math.abs((dims.height - source.height) / source.height) > 0.01) {
        const panels = mapBoxes(out.panels, sx, sy, dims.width, dims.height);
        const bubbles = mapBoxes(out.bubbles, sx, sy, dims.width, dims.height);
        const sequence = mapBoxes(out.sequence, sx, sy, dims.width, dims.height);
        out = { ...out, panels: panels.boxes, bubbles: bubbles.boxes, sequence: sequence.boxes };
        if (out.panelPoints) out.panelPoints = mapPoints(out.panelPoints, sx, sy);
        if (out.bubblePoints) out.bubblePoints = mapPoints(out.bubblePoints, sx, sy);
        summary.scaled++;
        // Count only visible boxes; sequence entries always mirror a panel/bubble box.
        summary.clamped += panels.clampedCount + bubbles.clampedCount;
      }
      out.width = dims.width;
      out.height = dims.height;
    }
    result[targetName] = out;
    matchedSources.add(sourceName);
    summary[matchType]++;
  };

  for (const targetName of targetPages) {
    if (byName.has(targetName)) {
      attach(targetName, byName.get(targetName), 'exact');
    } else if (byLower.has(targetName.toLowerCase())) {
      attach(targetName, byLower.get(targetName.toLowerCase()), 'ci');
    } else if (byBase.has(baseName(targetName)) && !matchedSources.has(byBase.get(baseName(targetName)))) {
      attach(targetName, byBase.get(baseName(targetName)), 'basename');
    } else {
      unmatchedTargets.push(targetName);
    }
  }

  // Positional leftovers, numeric order on both sides.
  const leftoverSources = sourceNames.filter((name) => !matchedSources.has(name)).sort(numericCompare);
  const sortedTargets = unmatchedTargets.slice().sort(numericCompare);
  for (let i = 0; i < sortedTargets.length; i++) {
    if (i < leftoverSources.length) {
      attach(sortedTargets[i], leftoverSources[i], 'positional');
    } else {
      result[sortedTargets[i]] = null;
      summary.emptyTarget++;
    }
  }
  summary.dropped = sourceNames.length - matchedSources.size;

  return { pages: result, summary };
}

module.exports = { mapPages };
