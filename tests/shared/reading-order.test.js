const { sortReadingOrder, geometryOrder } = require('../../src/shared/reading-order');

describe('shared/reading-order', () => {
  describe('sortReadingOrder', () => {
    const A = [0, 0, 50, 50];
    const B = [100, 0, 50, 50];
    const C = [0, 100, 50, 50];
    const D = [100, 100, 50, 50];

    it('western sorts in Z-pattern (y*5 + x)', () => {
      expect(sortReadingOrder([D, B, C, A], 'western')).toEqual([A, B, C, D]);
    });

    it('manga sorts by y*1.5 - (x + w) (top-right before bottom-left)', () => {
      const topRight = [500, 0, 100, 100]; // score -600
      const bottomLeft = [0, 100, 100, 100]; // score 50
      expect(sortReadingOrder([bottomLeft, topRight], 'manga')).toEqual([topRight, bottomLeft]);
      // contrast: the same pair is ordered the other way for western
      expect(sortReadingOrder([bottomLeft, topRight], 'western')).toEqual([bottomLeft, topRight]);
    });

    it('handles empty input', () => {
      expect(sortReadingOrder([], 'western')).toEqual([]);
      expect(sortReadingOrder(null, 'manga')).toEqual(null);
    });
  });

  describe('geometryOrder', () => {
    it('western: groups are emitted panel-first with the panel order, orphans last', () => {
      const p1 = [0, 0, 400, 300];
      const p2 = [0, 350, 400, 300];
      const b1 = [50, 50, 100, 60]; // inside p1
      const orphan = [500, 600, 80, 50]; // outside both panels

      const out = geometryOrder([p2, p1], [orphan, b1], 'western');
      expect(out.map((x) => x.kind)).toEqual(['panel', 'bubble', 'panel', 'bubble']);
      expect(out.map((x) => x.box)).toEqual([p1, b1, p2, orphan]);
    });

    it('western: assigns bubbles by centre-in-panel or IoA >= 0.8', () => {
      const panel = [0, 0, 100, 100];
      const inside = [10, 10, 20, 20];
      const outside = [300, 300, 20, 20];
      const out = geometryOrder([panel], [outside, inside], 'western');
      expect(out.map((x) => x.box)).toEqual([panel, inside, outside]);
    });

    it('manga: bubbles come before their panel within a group, weighted group order', () => {
      const panel = [100, 100, 200, 200]; // score 150 - 300 = -150
      const child = [150, 150, 50, 50]; // inside panel -> IoA 1
      const orphan = [0, 0, 50, 50]; // score -50 (after the panel group)

      const out = geometryOrder([panel], [orphan, child], 'manga');
      expect(out.map((x) => x.kind)).toEqual(['bubble', 'panel', 'bubble']);
      expect(out.map((x) => x.box)).toEqual([child, panel, orphan]);
    });

    it('handles empty inputs', () => {
      expect(geometryOrder([], [], 'western')).toEqual([]);
      expect(geometryOrder(null, null, 'manga')).toEqual([]);
    });
  });
});
