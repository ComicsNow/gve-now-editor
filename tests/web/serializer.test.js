'use strict';

const { serializeEditorPages } = require('../../src/web/editor/serializer');

describe('web/editor/serializer', () => {
  it('serializes and rounds boxes and points', () => {
    const pages = {
      'p1.jpg': {
        width: 1000,
        height: 1500,
        items: [
          { id: 'i1', kind: 'bubble', box: [10.4, 20.6, 100.1, 200.4], points: [[10.2, 20.4], [50.8, 60.1], [10.2, 80.9]] }
        ],
        order: ['i1']
      }
    };

    const out = serializeEditorPages(pages);
    expect(out['p1.jpg']).toEqual({
      width: 1000,
      height: 1500,
      items: [
        { id: 'i1', kind: 'bubble', box: [10, 21, 100, 200], points: [[10, 20], [51, 60], [10, 81]] }
      ],
      order: ['i1']
    });
  });

  it('handles empty or missing pages gracefully', () => {
    expect(serializeEditorPages(null)).toEqual({});
    expect(serializeEditorPages({})).toEqual({});
  });
});
