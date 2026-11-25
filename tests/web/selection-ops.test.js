'use strict';

const { shapeFor } = require('../../src/web/editor/selection-ops');

describe('web/editor/selection-ops', () => {
  it('remaps points when item has shape vertices', () => {
    const item = {
      box: [0, 0, 100, 100],
      points: [[0, 0], [100, 0], [100, 100]]
    };
    const next = shapeFor(item, [50, 50, 200, 200]);
    expect(next).toEqual([[50, 50], [250, 50], [250, 250]]);
  });

  it('returns undefined when item has no points', () => {
    const item = { box: [0, 0, 100, 100] };
    expect(shapeFor(item, [10, 10, 100, 100])).toBeUndefined();
  });
});
