'use strict';

const { sortItemIdsByGeometry } = require('../../src/web/editor/reading-sort');

describe('web/editor/reading-sort', () => {
  it('returns empty array for empty items', () => {
    expect(sortItemIdsByGeometry([], 'western')).toEqual([]);
  });

  it('preserves order of coincident items with identical coordinates in geometric order', () => {
    const items = [
      { id: 'i0', kind: 'panel', box: [10, 10, 100, 100] },
      { id: 'i1', kind: 'panel', box: [10, 10, 100, 100] },
      { id: 'i2', kind: 'panel', box: [200, 200, 100, 100] }
    ];
    const sorted = sortItemIdsByGeometry(items, 'western');
    expect(sorted).toEqual(['i0', 'i1', 'i2']);
  });

  it('distinguishes panel and bubble sharing identical bounds', () => {
    const items = [
      { id: 'p1', kind: 'panel', box: [50, 50, 100, 100] },
      { id: 'b1', kind: 'bubble', box: [50, 50, 100, 100] }
    ];
    // Western emits panel first, then its bubble
    const sorted = sortItemIdsByGeometry(items, 'western');
    expect(sorted).toEqual(['p1', 'b1']);
  });
});
