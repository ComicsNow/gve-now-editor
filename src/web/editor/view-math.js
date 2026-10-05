'use strict';

// Stage view transform math. View = { scale, offsetX, offsetY } applied as
// translate(offset) scale(scale) on a W x H native-px element.

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

function clampZoom(scale) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

function fitWidthScale(viewportWidth, pageWidth) {
  if (!(viewportWidth > 0) || !(pageWidth > 0)) return 1;
  return viewportWidth / pageWidth;
}

// Zoom by `factor` keeping the native point under (pointerX, pointerY) fixed
// on screen.
function zoomAt(view, pointerX, pointerY, factor) {
  const scale = clampZoom(view.scale * factor);
  const nativeX = (pointerX - view.offsetX) / view.scale;
  const nativeY = (pointerY - view.offsetY) / view.scale;
  return {
    scale,
    offsetX: pointerX - nativeX * scale,
    offsetY: pointerY - nativeY * scale
  };
}

// Scale at which the whole page just fits the viewport — the zoom-out floor.
function containScale(viewportWidth, viewportHeight, pageWidth, pageHeight) {
  if (!(viewportWidth > 0) || !(viewportHeight > 0) || !(pageWidth > 0) || !(pageHeight > 0)) return MIN_ZOOM;
  return Math.min(viewportWidth / pageWidth, viewportHeight / pageHeight);
}

// Pin the view to the viewport: the page is centered in any axis where it is
// smaller than the viewport, otherwise its offsets are clamped to the edges so
// no dead space ever shows. Zoom is limited to [contain scale, MAX_ZOOM]; if
// the scale changes here, the viewport centre stays anchored to the same
// native point. Degenerate sizes (unlaid-out DOM) leave the view untouched.
function resolveView(view, viewportWidth, viewportHeight, pageWidth, pageHeight) {
  if (
    !(viewportWidth > 0) || !(viewportHeight > 0) ||
    !(pageWidth > 0) || !(pageHeight > 0) ||
    !(view.scale > 0)
  ) {
    return { ...view };
  }
  const scale = Math.min(MAX_ZOOM, Math.max(containScale(viewportWidth, viewportHeight, pageWidth, pageHeight), view.scale));
  let offsetX = view.offsetX;
  let offsetY = view.offsetY;
  if (scale !== view.scale) {
    const cx = viewportWidth / 2;
    const cy = viewportHeight / 2;
    const nativeX = (cx - offsetX) / view.scale;
    const nativeY = (cy - offsetY) / view.scale;
    offsetX = cx - nativeX * scale;
    offsetY = cy - nativeY * scale;
  }
  const scaledW = pageWidth * scale;
  const scaledH = pageHeight * scale;
  offsetX = scaledW <= viewportWidth ? (viewportWidth - scaledW) / 2 : Math.min(0, Math.max(viewportWidth - scaledW, offsetX));
  offsetY = scaledH <= viewportHeight ? (viewportHeight - scaledH) / 2 : Math.min(0, Math.max(viewportHeight - scaledH, offsetY));
  return { scale, offsetX, offsetY };
}

module.exports = { MIN_ZOOM, MAX_ZOOM, clampZoom, fitWidthScale, zoomAt, containScale, resolveView };
