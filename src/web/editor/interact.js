'use strict';

// Pointer/geometry math for the stage. Pure functions only; the DOM wiring
// lives in stage.js.

const MIN_BOX_SIZE = 4;

// Client point -> native page px, using the rendered stage rect (mirrors the
// reader's input mapping in public/js/viewer/guided/input.js).
function pointerToNative(clientX, clientY, rect, pageWidth, pageHeight) {
  const sx = rect.width > 0 ? rect.width / pageWidth : 1;
  const sy = rect.height > 0 ? rect.height / pageHeight : 1;
  return { x: (clientX - rect.left) / sx, y: (clientY - rect.top) / sy };
}

// Any two corners -> [x, y, w, h].
function boxFromPoints(x1, y1, x2, y2) {
  return [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
}

// Resize one edge/corner of `box` by (dx, dy) native px. The opposite
// edge/corner stays fixed; the moved edge is clamped to the page and to
// MIN_BOX_SIZE. Returns unrounded values (callers round on commit).
function resizeBox(box, handle, dx, dy, page) {
  let [x, y, w, h] = box;
  const right = x + w;
  const bottom = y + h;
  const maxW = page && Number.isFinite(page.width) ? page.width : Infinity;
  const maxH = page && Number.isFinite(page.height) ? page.height : Infinity;

  if (handle.includes('e')) {
    const newRight = Math.min(right + dx, maxW);
    w = Math.max(MIN_BOX_SIZE, newRight - x);
  }
  if (handle.includes('w')) {
    const newX = Math.max(0, Math.min(x + dx, right - MIN_BOX_SIZE));
    w = right - newX;
    x = newX;
  }
  if (handle.includes('s')) {
    const newBottom = Math.min(bottom + dy, maxH);
    h = Math.max(MIN_BOX_SIZE, newBottom - y);
  }
  if (handle.includes('n')) {
    const newY = Math.max(0, Math.min(y + dy, bottom - MIN_BOX_SIZE));
    h = bottom - newY;
    y = newY;
  }
  return [x, y, w, h];
}

// Drag/nudge: translate the box, clamping it inside the page unless
// `clamp: false` (used when the user wants to preserve an out-of-bounds box).
function translateBox(box, dx, dy, page, { clamp = true } = {}) {
  let [x, y, w, h] = box;
  x += dx;
  y += dy;
  if (clamp && page) {
    const maxX = Number.isFinite(page.width) ? Math.max(0, page.width - w) : Infinity;
    const maxY = Number.isFinite(page.height) ? Math.max(0, page.height - h) : Infinity;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));
  }
  return [x, y, w, h];
}

// Bounding box of a free-drawn polygon ([[x,y], ...]) — the canonical rect
// the reader zooms to. Unrounded; callers round on commit.
function polygonBox(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX - minX, maxY - minY];
}

// Re-express polygon vertices when their box changes (resize or move): the
// vertices keep their relative position inside the box. Degenerate old sizes
// fall back to translation only. Unrounded; callers round on commit.
function remapPoints(points, oldBox, newBox) {
  const sx = oldBox[2] > 0 ? newBox[2] / oldBox[2] : 1;
  const sy = oldBox[3] > 0 ? newBox[3] / oldBox[3] : 1;
  return points.map(([px, py]) => [newBox[0] + (px - oldBox[0]) * sx, newBox[1] + (py - oldBox[1]) * sy]);
}

module.exports = { MIN_BOX_SIZE, pointerToNative, boxFromPoints, resizeBox, translateBox, polygonBox, remapPoints };
