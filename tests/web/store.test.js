const { createStore } = require('../../src/web/editor/store');

function sampleDoc() {
  return {
    comicId: 'c1',
    type: 'western',
    pages: {
      'P00001.jpg': {
        width: 100,
        height: 200,
        items: [
          { id: 'i0', kind: 'panel', box: [0, 0, 100, 200] },
          { id: 'i1', kind: 'bubble', box: [10, 10, 40, 30] }
        ],
        order: ['i0', 'i1']
      },
      'P00002.jpg': { width: 100, height: 200, items: [], order: [] }
    }
  };
}

describe('web/store', () => {
  it('loads a document, picks the first page, and is clean', () => {
    const store = createStore();
    store.load(sampleDoc());
    expect(store.getComicId()).toBe('c1');
    expect(store.getType()).toBe('western');
    expect(store.getCurrentPage()).toBe('P00001.jpg');
    expect(store.isDirty()).toBe(false);
    expect(store.getPages()).toEqual(['P00001.jpg', 'P00002.jpg']);
  });

  it('adds items, inserting into the order at the caret index', () => {
    const store = createStore();
    store.load(sampleDoc());
    const id = store.addItem('bubble', [50, 60, 20, 20], 1);
    const page = store.getPage();
    expect(page.order).toEqual(['i0', id, 'i1']);
    expect(page.items.find((i) => i.id === id)).toEqual({ id, kind: 'bubble', box: [50, 60, 20, 20] });
    expect(store.isDirty()).toBe(true);
  });

  it('appends when the caret index is omitted or out of range', () => {
    const store = createStore();
    store.load(sampleDoc());
    const a = store.addItem('panel', [1, 1, 4, 4]);
    const b = store.addItem('panel', [2, 2, 4, 4], 99);
    expect(store.getPage().order).toEqual(['i0', 'i1', a, b]);
  });

  it('updates, removes, and moves items', () => {
    const store = createStore();
    store.load(sampleDoc());
    expect(store.updateItem('i1', [12, 12, 40, 30])).toBe(true);
    expect(store.getPage().items.find((i) => i.id === 'i1').box).toEqual([12, 12, 40, 30]);
    expect(store.updateItem('missing', [0, 0, 1, 1])).toBe(false);

    expect(store.moveItem('i1', 0)).toBe(true);
    expect(store.getPage().order).toEqual(['i1', 'i0']);
    expect(store.moveItemBy('i1', 1)).toBe(true);
    expect(store.getPage().order).toEqual(['i0', 'i1']);

    expect(store.removeItems(['i1'])).toBe(1);
    expect(store.getPage().items.map((i) => i.id)).toEqual(['i0']);
    expect(store.getPage().order).toEqual(['i0']);
  });

  it('setOrder only accepts permutations of the current items', () => {
    const store = createStore();
    store.load(sampleDoc());
    expect(store.setOrder(['i1', 'i0'])).toBe(true);
    expect(store.getPage().order).toEqual(['i1', 'i0']);
    expect(store.setOrder(['i1'])).toBe(false);
    expect(store.setOrder(['i1', 'i0', 'ghost'])).toBe(false);
    expect(store.setOrder(['i1', 'i1'])).toBe(false);
  });

  it('stores free-drawn points on addItem, as a deep copy', () => {
    const store = createStore();
    store.load(sampleDoc());
    const pts = [[10, 10], [90, 10], [50, 90]];
    const id = store.addItem('panel', [10, 10, 80, 80], -1, pts);
    const item = store.getPage().items.find((i) => i.id === id);
    expect(item.points).toEqual(pts);
    pts[0][0] = 999;
    expect(item.points[0][0]).toBe(10);
    // Rect-only items get no points property at all (keeps saves minimal).
    const plain = store.addItem('bubble', [5, 5, 10, 10]);
    expect('points' in store.getPage().items.find((i) => i.id === plain)).toBe(false);
  });

  it('updateItem keeps points when omitted, replaces them, or clears with null', () => {
    const store = createStore();
    store.load(sampleDoc());
    const id = store.addItem('panel', [0, 0, 100, 100], -1, [[0, 0], [100, 0], [0, 100]]);
    store.updateItem(id, [10, 10, 100, 100]);
    expect(store.getPage().items.find((i) => i.id === id).points).toEqual([[0, 0], [100, 0], [0, 100]]);

    const next = [[10, 10], [110, 10]];
    store.updateItem(id, [10, 10, 100, 100], next);
    expect(store.getPage().items.find((i) => i.id === id).points).toEqual(next);
    next[0][1] = 777;
    expect(store.getPage().items.find((i) => i.id === id).points[0][1]).toBe(10);

    store.updateItem(id, [10, 10, 100, 100], null);
    expect('points' in store.getPage().items.find((i) => i.id === id)).toBe(false);
  });

  it('snapshot/restore round-trips a page state', () => {
    const store = createStore();
    store.load(sampleDoc());
    const before = store.snapshot();
    store.addItem('panel', [5, 5, 5, 5], 0);
    store.updateItem('i0', [9, 9, 9, 9]);
    store.restore(before);
    expect(store.getPage().order).toEqual(['i0', 'i1']);
    expect(store.getPage().items).toEqual(sampleDoc().pages['P00001.jpg'].items);
    // Snapshot is a deep copy: mutating it must not leak into the store.
    before.items[0].box[0] = 777;
    expect(store.getPage().items[0].box[0]).toBe(0);

    // Points survive undo: draw a polygon, undo, redo (restore the snapshot).
    const store2 = createStore();
    store2.load(sampleDoc());
    const id = store2.addItem('panel', [10, 10, 80, 80], -1, [[10, 10], [90, 10], [50, 90]]);
    const withShape = store2.snapshot();
    const prev = { page: 'P00001.jpg', width: 100, height: 200, items: sampleDoc().pages['P00001.jpg'].items, order: ['i0', 'i1'] };
    store2.restore(prev);
    expect(store2.getPage().items.map((i) => i.id)).toEqual(['i0', 'i1']);
    store2.restore(withShape);
    expect(store2.getPage().items.find((i) => i.id === id).points).toEqual([[10, 10], [90, 10], [50, 90]]);
    // Restore is also a deep copy of the points.
    withShape.items[2].points[0][0] = 999;
    expect(store2.getPage().items.find((i) => i.id === id).points[0][0]).toBe(10);
  });

  it('notifies subscribers and markSaved clears the dirty flag', () => {
    const store = createStore();
    store.load(sampleDoc());
    let calls = 0;
    const off = store.onChange(() => calls++);
    store.addItem('panel', [0, 0, 4, 4]);
    expect(calls).toBe(1);
    off();
    store.addItem('panel', [0, 0, 4, 4]);
    expect(calls).toBe(1);
    store.markSaved();
    expect(store.isDirty()).toBe(false);
  });

  it('rejects unknown pages on setCurrentPage', () => {
    const store = createStore();
    store.load(sampleDoc());
    expect(() => store.setCurrentPage('nope.jpg')).toThrow('unknown page');
  });
});
