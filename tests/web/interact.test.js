const {
  pointerToNative,
  boxFromPoints,
  resizeBox,
  translateBox,
  polygonBox,
  remapPoints
} = require('../../src/web/editor/interact');

describe('web/interact', () => {
  describe('pointerToNative', () => {
    it('maps a client point through the rendered stage rect', () => {
      // Page 100x200 rendered at 200x400 starting at (100, 50): scale 2.
      const rect = { left: 100, top: 50, width: 200, height: 400 };
      expect(pointerToNative(150, 250, rect, 100, 200)).toEqual({ x: 25, y: 100 });
      expect(pointerToNative(100, 50, rect, 100, 200)).toEqual({ x: 0, y: 0 });
      expect(pointerToNative(300, 450, rect, 100, 200)).toEqual({ x: 100, y: 200 });
    });
  });

  describe('boxFromPoints', () => {
    it('normalizes any two corners into a box', () => {
      expect(boxFromPoints(90, 250, 10, 50)).toEqual([10, 50, 80, 200]);
      expect(boxFromPoints(10, 50, 90, 250)).toEqual([10, 50, 80, 200]);
    });
  });

  describe('resizeBox', () => {
    const page = { width: 100, height: 100 };
    it('grows from the se handle and clamps to the page', () => {
      expect(resizeBox([10, 10, 50, 50], 'se', 100, 100, page)).toEqual([10, 10, 90, 90]);
    });
    it('shrinks from the nw handle keeping the opposite corner fixed', () => {
      expect(resizeBox([10, 10, 50, 50], 'nw', -30, -30, page)).toEqual([0, 0, 60, 60]);
    });
    it('enforces a 4px minimum size', () => {
      expect(resizeBox([10, 10, 50, 50], 'e', -60, 0, page)).toEqual([10, 10, 4, 50]);
      expect(resizeBox([10, 10, 50, 50], 'n', 0, 60, page)).toEqual([10, 56, 50, 4]);
    });
    it('moves the north edge keeping the bottom edge fixed', () => {
      expect(resizeBox([10, 10, 50, 50], 'n', 0, 4, page)).toEqual([10, 14, 50, 46]);
    });
    it('respects the page bounds on west/south handles', () => {
      expect(resizeBox([10, 10, 50, 50], 'w', -20, 0, page)).toEqual([0, 10, 60, 50]);
      expect(resizeBox([10, 10, 50, 50], 's', 0, 200, page)).toEqual([10, 10, 50, 90]);
    });
  });

  describe('translateBox', () => {
    it('moves a box and clamps it inside the page', () => {
      expect(translateBox([10, 10, 50, 50], 20, 20, { width: 100, height: 100 })).toEqual([30, 30, 50, 50]);
      expect(translateBox([10, 10, 50, 50], -100, -100, { width: 100, height: 100 })).toEqual([0, 0, 50, 50]);
      expect(translateBox([10, 10, 50, 50], 200, 200, { width: 100, height: 100 })).toEqual([50, 50, 50, 50]);
    });

    it('supports unclamped nudges for out-of-bounds preservation', () => {
      expect(translateBox([10, 10, 50, 50], -100, 0, { width: 100, height: 100 }, { clamp: false })).toEqual([-90, 10, 50, 50]);
    });
  });

  describe('polygonBox', () => {
    it('is the bounding box of the vertices', () => {
      expect(polygonBox([[10, 20], [50, 20], [30, 60]])).toEqual([10, 20, 40, 40]);
    });

    it('handles a single point (zero-area box)', () => {
      expect(polygonBox([[7, 9]])).toEqual([7, 9, 0, 0]);
    });

    it('keeps fractional values unrounded (callers round on commit)', () => {
      expect(polygonBox([[10.5, 20.25], [30.5, 40.25]])).toEqual([10.5, 20.25, 20, 20]);
    });
  });

  describe('remapPoints', () => {
    it('translates all vertices with the box', () => {
      expect(remapPoints([[10, 10], [60, 60]], [10, 10, 50, 50], [20, 20, 50, 50])).toEqual([[20, 20], [70, 70]]);
    });

    it('scales vertices proportionally when the box is resized', () => {
      expect(remapPoints([[10, 20], [100, 100]], [0, 0, 100, 100], [0, 0, 200, 200])).toEqual([[20, 40], [200, 200]]);
    });

    it('combines translate and scale (resize from a non-zero origin)', () => {
      // old box [10,10,100,100] -> new [20,30,50,200]: sx 0.5, sy 2
      expect(remapPoints([[20, 20], [110, 110]], [10, 10, 100, 100], [20, 30, 50, 200])).toEqual([[25, 50], [70, 230]]);
    });

    it('keeps coordinates unchanged for a degenerate old size', () => {
      expect(remapPoints([[5, 5]], [5, 5, 0, 0], [10, 10, 20, 20])).toEqual([[10, 10]]);
    });
  });
});
