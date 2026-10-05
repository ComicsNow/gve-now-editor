'use strict';

// Thresholds shared with comics-now's detector and reader
// (server/services/panel-detector.js, public/js/viewer/guided/geometry.js).
const CHILD_IOA = 0.7;
const PARENT_IOA = 0.6;
const WESTERN_BUBBLE_IOA = 0.8;

function isBox(v) {
  return Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function roundBox(b) {
  return b.map((v) => {
    const r = Math.round(v);
    return r === 0 ? 0 : r; // normalize -0
  });
}

function boxesEqual(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function boxKey(b) {
  return b.join(',');
}

function clampBox(box, pageW, pageH) {
  const [x, y, w, h] = box;
  const cx = Math.min(Math.max(0, x), pageW);
  const cy = Math.min(Math.max(0, y), pageH);
  const cw = Math.min(w, Math.max(0, pageW - cx));
  const ch = Math.min(h, Math.max(0, pageH - cy));
  return [cx, cy, cw, ch];
}

// Fraction of box A's area that lies inside box B.
function intersectionOverArea(a, b) {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);
  const iw = Math.max(0, x2 - x1);
  const ih = Math.max(0, y2 - y1);
  const area = aw * ah;
  return area > 0 ? (iw * ih) / area : 0;
}

function iou(a, b) {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = aw * ah + bw * bh - inter;
  return union > 0 ? inter / union : 0;
}

// True when the bubble's centre lies inside the panel.
function isBubbleInPanel(bubble, panel) {
  const [bx, by, bw, bh] = bubble;
  const [px, py, pw, ph] = panel;
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  return cx >= px && cx <= px + pw && cy >= py && cy <= py + ph;
}

module.exports = {
  CHILD_IOA,
  PARENT_IOA,
  WESTERN_BUBBLE_IOA,
  isBox,
  roundBox,
  boxesEqual,
  boxKey,
  clampBox,
  intersectionOverArea,
  iou,
  isBubbleInPanel
};
