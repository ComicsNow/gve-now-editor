const { reorderIdList, insertionIndexFromY, nextBadgeNumbers, dropIndex } = require('../../src/web/editor/order-panel');

describe('web/order-panel', () => {
  describe('reorderIdList', () => {
    it('moves an id to the target index (splice semantics)', () => {
      expect(reorderIdList(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
      expect(reorderIdList(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
      expect(reorderIdList(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
    });

    it('ties badge numbering to the new order', () => {
      const order = reorderIdList(['a', 'b', 'c'], 0, 2);
      expect(nextBadgeNumbers(order)).toEqual({ a: 3, b: 1, c: 2 });
    });
  });

  describe('insertionIndexFromY', () => {
    const rows = [
      { top: 0, height: 30 }, // midpoint 15
      { top: 30, height: 30 }, // midpoint 45
      { top: 60, height: 30 } // midpoint 75
    ];

    it('computes the caret index from a pointer y', () => {
      expect(insertionIndexFromY(rows, -10)).toBe(0);
      expect(insertionIndexFromY(rows, 10)).toBe(0);
      expect(insertionIndexFromY(rows, 40)).toBe(1);
      expect(insertionIndexFromY(rows, 70)).toBe(2);
      expect(insertionIndexFromY(rows, 500)).toBe(3);
    });
  });

  describe('dropIndex', () => {
    it('converts an insertion position into the final index after removal', () => {
      expect(dropIndex(0, 2)).toBe(1); // dragged down past one row
      expect(dropIndex(1, 0)).toBe(0); // dragged up to the top
      expect(dropIndex(1, 3)).toBe(2); // dragged down past two rows
      expect(dropIndex(2, 1)).toBe(1); // dragged up past one row
    });

    it('is a no-op while the pointer stays on the dragged row', () => {
      expect(dropIndex(1, 1)).toBe(1); // over its own top half
      expect(dropIndex(1, 2)).toBe(1); // over its own bottom half
      expect(dropIndex(0, 0)).toBe(0);
    });
  });
});
