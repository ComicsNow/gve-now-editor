const { mapPages } = require('../../src/server/page-map');

const page = (panels, extra = {}) => ({ width: 100, height: 200, panels, bubbles: [], sequence: panels, ...extra });

describe('server/page-map', () => {
  it('matches exact names and leaves geometry untouched when dims agree', () => {
    const src = { 'p1.jpg': page([[0, 0, 50, 50]]) };
    const r = mapPages({ pages: src, targetPages: ['p1.jpg'], targetDims: { 'p1.jpg': { width: 100, height: 200 } } });
    expect(r.pages['p1.jpg'].matchType).toBe('exact');
    expect(r.pages['p1.jpg'].sourceName).toBe('p1.jpg');
    expect(r.pages['p1.jpg'].panels).toEqual([[0, 0, 50, 50]]);
    expect(r.summary).toMatchObject({ exact: 1, ci: 0, basename: 0, positional: 0, dropped: 0, emptyTarget: 0, scaled: 0, clamped: 0 });
  });

  it('falls back to case-insensitive and basename matching', () => {
    const src = { 'P1.JPG': page([[0, 0, 50, 50]]), 'sub/dir/p2.jpg': page([[0, 0, 50, 50]]) };
    const r = mapPages({ pages: src, targetPages: ['p1.jpg', 'p2.jpg'], targetDims: {} });
    expect(r.pages['p1.jpg'].matchType).toBe('ci');
    expect(r.pages['p2.jpg'].matchType).toBe('basename');
    expect(r.pages['p2.jpg'].sourceName).toBe('sub/dir/p2.jpg');
  });

  it('positionally pairs leftovers by numeric-aware order', () => {
    const src = { 'b2.png': page([[1, 1, 5, 5]]), 'b10.png': page([[2, 2, 5, 5]]), 'b1.png': page([[3, 3, 5, 5]]) };
    const r = mapPages({ pages: src, targetPages: ['x1.png', 'x2.png', 'x3.png'], targetDims: {} });
    expect(r.pages['x1.png'].sourceName).toBe('b1.png');
    expect(r.pages['x2.png'].sourceName).toBe('b2.png');
    expect(r.pages['x3.png'].sourceName).toBe('b10.png');
    expect(r.summary.positional).toBe(3);
  });

  it('scales boxes when dimensions differ by more than 1%, keeping sequence consistent', () => {
    const src = { 'p1.jpg': page([[10, 20, 30, 40]], { bubbles: [[5, 5, 10, 10]], sequence: [[5, 5, 10, 10]] }) };
    const r = mapPages({ pages: src, targetPages: ['p1.jpg'], targetDims: { 'p1.jpg': { width: 200, height: 400 } } });
    expect(r.pages['p1.jpg'].panels).toEqual([[20, 40, 60, 80]]);
    expect(r.pages['p1.jpg'].bubbles).toEqual([[10, 10, 20, 20]]);
    expect(r.pages['p1.jpg'].sequence).toEqual([[10, 10, 20, 20]]);
    expect(r.pages['p1.jpg'].width).toBe(200);
    expect(r.summary.scaled).toBe(1);
    expect(r.summary.clamped).toBe(0);
  });

  it('passes free-draw points through and scales them with the boxes', () => {
    const pts = [[10, 20], [40, 20], [25, 60]];
    const src = { 'p1.jpg': page([[10, 20, 30, 40]], { panelPoints: [pts] }) };
    const same = mapPages({ pages: src, targetPages: ['p1.jpg'], targetDims: { 'p1.jpg': { width: 100, height: 200 } } });
    expect(same.pages['p1.jpg'].panelPoints).toEqual([pts]);

    const scaled = mapPages({ pages: src, targetPages: ['p1.jpg'], targetDims: { 'p1.jpg': { width: 200, height: 400 } } });
    expect(scaled.pages['p1.jpg'].panelPoints).toEqual([[[20, 40], [80, 40], [50, 120]]]);
  });

  it('keeps parallel null point entries aligned when scaling', () => {
    const pts = [[10, 20], [40, 20], [25, 60]];
    const src = {
      'p2.jpg': { width: 100, height: 200, panels: [[10, 20, 30, 40], [0, 0, 10, 10]], bubbles: [], sequence: [[10, 20, 30, 40]], panelPoints: [pts, null] }
    };
    const r = mapPages({ pages: src, targetPages: ['p2.jpg'], targetDims: { 'p2.jpg': { width: 200, height: 400 } } });
    expect(r.pages['p2.jpg'].panelPoints).toEqual([[[20, 40], [80, 40], [50, 120]], null]);
  });

  it('does not scale when dimensions differ by 1% or less', () => {
    const src = { 'p1.jpg': page([[0, 0, 50, 50]]) };
    const r = mapPages({ pages: src, targetPages: ['p1.jpg'], targetDims: { 'p1.jpg': { width: 101, height: 201 } } });
    expect(r.pages['p1.jpg'].panels).toEqual([[0, 0, 50, 50]]);
    expect(r.summary.scaled).toBe(0);
  });

  it('clamps scaled boxes into the target page and counts them', () => {
    const src = { 'p1.jpg': page([[90, 90, 20, 20]], { width: 100, height: 100 }) };
    const r = mapPages({ pages: src, targetPages: ['p1.jpg'], targetDims: { 'p1.jpg': { width: 50, height: 50 } } });
    expect(r.pages['p1.jpg'].panels).toEqual([[45, 45, 5, 5]]);
    expect(r.summary.clamped).toBe(1);
  });

  it('counts unmatched source pages as dropped and unmatched targets as empty', () => {
    const src = { 'a1.png': page([[0, 0, 1, 1]]), 'a2.png': page([[0, 0, 1, 1]]), 'a3.png': page([[0, 0, 1, 1]]) };
    const two = mapPages({ pages: src, targetPages: ['t1.png', 't2.png'], targetDims: {} });
    expect(two.summary.dropped).toBe(1);
    expect(two.summary.emptyTarget).toBe(0);

    const four = mapPages({ pages: src, targetPages: ['t1.png', 't2.png', 't3.png', 't4.png'], targetDims: {} });
    expect(four.pages['t4.png']).toBeNull();
    expect(four.summary.emptyTarget).toBe(1);
    expect(four.summary.dropped).toBe(0);
  });

  it('never mutates the source pages', () => {
    const src = { 'p1.jpg': page([[10, 20, 30, 40]]) };
    const snapshot = JSON.parse(JSON.stringify(src));
    mapPages({ pages: src, targetPages: ['p1.jpg'], targetDims: { 'p1.jpg': { width: 200, height: 400 } } });
    expect(src).toEqual(snapshot);
  });
});
