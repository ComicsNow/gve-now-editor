const {
  isBox,
  roundBox,
  boxesEqual,
  boxKey,
  clampBox,
  intersectionOverArea,
  iou,
  isBubbleInPanel,
  CHILD_IOA,
  PARENT_IOA,
  WESTERN_BUBBLE_IOA
} = require('../../src/shared/box');

describe('shared/box', () => {
  describe('isBox', () => {
    it('accepts arrays of four finite numbers', () => {
      expect(isBox([0, 0, 10, 10])).toBe(true);
      expect(isBox([-3, 4.5, 100, 0])).toBe(true);
    });

    it('rejects non-arrays, wrong lengths and non-numbers', () => {
      expect(isBox(null)).toBe(false);
      expect(isBox(undefined)).toBe(false);
      expect(isBox([0, 0, 10])).toBe(false);
      expect(isBox([0, 0, 10, 10, 5])).toBe(false);
      expect(isBox([0, 0, '10', 10])).toBe(false);
      expect(isBox([0, 0, NaN, 10])).toBe(false);
      expect(isBox([0, 0, Infinity, 10])).toBe(false);
      expect(isBox({ 0: 0, 1: 0, 2: 10, 3: 10 })).toBe(false);
    });
  });

  describe('roundBox', () => {
    it('rounds each component to an integer', () => {
      expect(roundBox([1.4, 2.5, 3.6, 4.2])).toEqual([1, 3, 4, 4]);
      expect(roundBox([10, 20, 30, 40])).toEqual([10, 20, 30, 40]);
    });

    it('normalizes negative zero to zero', () => {
      expect(roundBox([-0.2, -0.2, 1, 1])).toEqual([0, 0, 1, 1]);
    });
  });

  describe('boxesEqual / boxKey', () => {
    it('compares by exact values', () => {
      expect(boxesEqual([1, 2, 3, 4], [1, 2, 3, 4])).toBe(true);
      expect(boxesEqual([1, 2, 3, 4], [1, 2, 3, 5])).toBe(false);
      expect(boxKey([1, 2, 3, 4])).toBe('1,2,3,4');
    });
  });

  describe('clampBox', () => {
    const W = 200;
    const H = 100;

    it('leaves fully-inside boxes unchanged', () => {
      expect(clampBox([10, 10, 50, 50], W, H)).toEqual([10, 10, 50, 50]);
    });

    it('clamps negative x/y', () => {
      expect(clampBox([-10, -5, 100, 50], W, H)).toEqual([0, 0, 100, 50]);
    });

    it('shrinks w/h that overflow the right/bottom edges', () => {
      expect(clampBox([150, 90, 100, 50], W, H)).toEqual([150, 90, 50, 10]);
    });

    it('clamps and shrinks in both directions', () => {
      expect(clampBox([-10, -10, 300, 300], W, H)).toEqual([0, 0, 200, 100]);
    });
  });

  describe('intersectionOverArea', () => {
    it('returns the fraction of A inside B', () => {
      expect(intersectionOverArea([0, 0, 10, 10], [5, 5, 10, 10])).toBeCloseTo(0.25, 10);
      expect(intersectionOverArea([5, 5, 5, 5], [0, 0, 10, 10])).toBe(1);
      expect(intersectionOverArea([0, 0, 10, 10], [50, 50, 10, 10])).toBe(0);
    });

    it('returns 0 for zero-area A', () => {
      expect(intersectionOverArea([0, 0, 0, 10], [0, 0, 10, 10])).toBe(0);
    });
  });

  describe('iou', () => {
    it('is intersection over union', () => {
      expect(iou([0, 0, 10, 10], [5, 5, 10, 10])).toBeCloseTo(25 / 175, 10);
      expect(iou([0, 0, 10, 10], [0, 0, 10, 10])).toBe(1);
    });
  });

  describe('isBubbleInPanel', () => {
    it('tests whether the bubble centre is inside the panel', () => {
      expect(isBubbleInPanel([12, 12, 6, 6], [0, 0, 20, 20])).toBe(true);
      expect(isBubbleInPanel([30, 30, 6, 6], [0, 0, 20, 20])).toBe(false);
    });
  });

  describe('threshold constants', () => {
    it('match the detector/reader thresholds', () => {
      expect(CHILD_IOA).toBe(0.7);
      expect(PARENT_IOA).toBe(0.6);
      expect(WESTERN_BUBBLE_IOA).toBe(0.8);
    });
  });
});
