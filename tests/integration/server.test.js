const { startHarness } = require('../helpers/app-harness');
const { api } = require('../helpers/api');

describe('integration: export -> import -> edit round trip', () => {
  let h;
  beforeAll(async () => {
    h = await startHarness({
      comics: [
        { id: 'orig', series: 'Ser', name: 'Ser 01.cbz', totalPages: 2, metadata: '{"Series":"Ser","Number":"1","Year":"2024"}' },
        { id: 'clone', series: 'Ser', name: 'Ser 01 renamed.cbz', totalPages: 2, metadata: '{"Series":"Ser","Number":"1","Year":"2024"}' }
      ],
      cbzPages: { orig: ['p1.jpg', 'p2.jpg'], clone: ['x1.jpg', 'x2.jpg'] },
      sidecars: {
        orig: {
          comicId: 'orig',
          type: 'western',
          pages: {
            'p1.jpg': { panels: [[0, 0, 1, 1]], bubbles: [[0, 0, 1, 1]], sequence: [[0, 0, 1, 1]] },
            'p2.jpg': { panels: [[0, 0, 1, 1]], bubbles: [], sequence: [[0, 0, 1, 1]] }
          }
        }
      }
    });
  });
  afterAll(() => h.close());

  it('moves guided view data from one comic to a renamed copy through the real HTTP surface', async () => {
    const health = await api(h.baseUrl, '/api/health');
    expect(health.body.ok).toBe(true);

    const exp = await api(h.baseUrl, '/api/comics/orig/export');
    expect(exp.status).toBe(200);

    const apply = await api(h.baseUrl, '/api/import/apply', {
      method: 'POST',
      body: { file: exp.body, comicId: 'clone', mode: 'replace' }
    });
    expect(apply.status).toBe(200);
    // different page names -> positional mapping
    expect(apply.body.summary.positional).toBe(2);

    const doc = await api(h.baseUrl, '/api/comics/clone/guided');
    expect(doc.status).toBe(200);
    expect(doc.body.type).toBe('western');
    // Worked-out western pages are bubble-only: the imported scaffold panels
    // were dropped on write.
    expect(doc.body.pages['x1.jpg'].items.map((i) => i.kind)).toEqual(['bubble']);

    // edit the clone: move the bubble, save
    const edited = doc.body;
    edited.pages['x1.jpg'].items[0].box = [10, 10, 1, 1];
    const save = await api(h.baseUrl, '/api/comics/clone/guided', { method: 'PUT', body: edited });
    expect(save.status).toBe(200);

    const after = await api(h.baseUrl, '/api/comics/clone/guided');
    expect(after.body.pages['x1.jpg'].items.map((i) => i.kind)).toEqual(['bubble']);
    expect(after.body.pages['x1.jpg'].items[0].box).toEqual([10, 10, 1, 1]);
  });

  it('round-trips free-draw points through PUT -> sidecar on disk -> GET', async () => {
    const doc = (await api(h.baseUrl, '/api/comics/orig/guided')).body;
    const bubble = doc.pages['p1.jpg'].items.find((i) => i.kind === 'bubble');
    bubble.points = [[0, 0], [1, 0], [0, 1]];
    const save = await api(h.baseUrl, '/api/comics/orig/guided', { method: 'PUT', body: doc });
    expect(save.status).toBe(200);

    const onDisk = h.store.read('orig');
    expect(onDisk.pages['p1.jpg'].bubblePoints).toEqual([[[0, 0], [1, 0], [0, 1]]]);
    // Rect-only items and pages gain no points keys.
    expect('panelPoints' in onDisk.pages['p1.jpg']).toBe(false);
    expect('panelPoints' in onDisk.pages['p2.jpg']).toBe(false);

    const after = await api(h.baseUrl, '/api/comics/orig/guided');
    const bubbleAfter = after.body.pages['p1.jpg'].items.find((i) => i.kind === 'bubble');
    expect(bubbleAfter.points).toEqual([[0, 0], [1, 0], [0, 1]]);

    // Export -> import carries the shape to the renamed comic too.
    const exp = await api(h.baseUrl, '/api/comics/orig/export');
    expect(exp.body.pages['p1.jpg'].bubblePoints).toEqual([[[0, 0], [1, 0], [0, 1]]]);
    const apply = await api(h.baseUrl, '/api/import/apply', {
      method: 'POST',
      body: { file: exp.body, comicId: 'clone', mode: 'replace' }
    });
    expect(apply.status).toBe(200);
    const cloneDoc = await api(h.baseUrl, '/api/comics/clone/guided');
    const cloneBubble = cloneDoc.body.pages['x1.jpg'].items.find((i) => i.kind === 'bubble');
    expect(cloneBubble.points).toEqual([[0, 0], [1, 0], [0, 1]]);
  });
});
