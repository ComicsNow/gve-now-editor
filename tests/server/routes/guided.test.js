const path = require('path');
const fs = require('fs');
const { startHarness } = require('../../helpers/app-harness');
const { api } = require('../../helpers/api');

const westernSidecar = () => ({
  comicId: 'c1',
  type: 'western',
  pages: {
    'p1.jpg': { panels: [[0, 0, 1, 1]], bubbles: [[0, 0, 1, 1]], sequence: [[0, 0, 1, 1]] },
    'p2.jpg': { panels: [[0, 0, 1, 1]], bubbles: [], sequence: [[0, 0, 1, 1]] }
  }
});

describe('routes/guided', () => {
  describe('GET editor document', () => {
    let h;
    beforeAll(async () => {
      h = await startHarness({
        comics: [{ id: 'c1', updatedAt: 1000, metadata: '{"Series":"Ser"}' }],
        cbzPages: { c1: ['p1.jpg', 'p2.jpg'] },
        sidecars: { c1: westernSidecar() }
      });
    });
    afterAll(() => h.close());

    it('returns the normalized document for every CBZ page with dimensions', async () => {
      const { status, body } = await api(h.baseUrl, '/api/comics/c1/guided');
      expect(status).toBe(200);
      expect(body.comicId).toBe('c1');
      expect(body.type).toBe('western');
      expect(Object.keys(body.pages).sort()).toEqual(['p1.jpg', 'p2.jpg']);

      const p1 = body.pages['p1.jpg'];
      expect(p1.width).toBe(1);
      expect(p1.height).toBe(1);
      // The stored page has both a panel and a bubble; the document the editor
      // works with is bubbles-only — panels are scaffold on worked-out pages.
      expect(p1.items.map((i) => i.kind)).toEqual(['bubble']);
      expect(p1.items[0].box).toEqual([0, 0, 1, 1]);
      expect(p1.order.length).toBe(1);
      expect(body.warnings).toEqual([]);
    });

    it('404s for an unknown comic', async () => {
      const { status } = await api(h.baseUrl, '/api/comics/nope/guided');
      expect(status).toBe(404);
    });
  });

  describe('PUT editor document', () => {
    let h;
    const putDoc = () => ({
      comicId: 'c1',
      type: 'western',
      pages: {
        'p1.jpg': {
          width: 1,
          height: 1,
          items: [{ id: 'b', kind: 'bubble', box: [0, 0, 1, 1] }],
          order: ['b']
        },
        'p2.jpg': {
          width: 1,
          height: 1,
          items: [{ id: 'c', kind: 'panel', box: [0, 0, 1, 1] }],
          order: ['c']
        }
      }
    });

    beforeEach(async () => {
      h = await startHarness({
        comics: [{ id: 'c1', updatedAt: 1000, metadata: '{"Series":"Ser"}' }],
        cbzPages: { c1: ['p1.jpg', 'p2.jpg'] },
        sidecars: { c1: westernSidecar() }
      });
    });
    afterEach(() => h.close());

    it('saves canonically, backs up the old file, and updates the DB without touching updatedAt', async () => {
      const doc = putDoc();
      // A real edit, so p1 regenerates canonically (an untouched page stays
      // verbatim, legacy scaffold panels included).
      doc.pages['p1.jpg'].items[0].points = [[0, 0], [1, 0], [0, 1]];
      const { status, body } = await api(h.baseUrl, '/api/comics/c1/guided', { method: 'PUT', body: doc });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.warnings).toEqual([]);
      expect(body.backupPath).toBeTruthy();
      expect(fs.existsSync(body.backupPath)).toBe(true);

      const saved = h.store.read('c1');
      // Edited page: canonical and bubble-only — the scaffold panels are gone.
      expect(saved.pages['p1.jpg']).toEqual({
        panels: [],
        bubbles: [[0, 0, 1, 1]],
        sequence: [[0, 0, 1, 1]],
        bubblePoints: [[[0, 0], [1, 0], [0, 1]]]
      });
      expect(saved.pages['p2.jpg']).toEqual({ panels: [[0, 0, 1, 1]], bubbles: [], sequence: [[0, 0, 1, 1]] });

      const row = h.db.prepare('SELECT * FROM comics WHERE id = ?').get('c1');
      expect(row.guidedViewStatus).toBe('completed');
      expect(row.guidedViewPath).toBe(path.join(h.config.guidedViewDir, 'c1.json'));
      expect(row.updatedAt).toBe(1000);
    });

    it('400s on a non-permutation order', async () => {
      const doc = putDoc();
      doc.pages['p1.jpg'].order = ['a'];
      const { status, body } = await api(h.baseUrl, '/api/comics/c1/guided', { method: 'PUT', body: doc });
      expect(status).toBe(400);
      expect(body.errors.join(' ')).toMatch(/order/i);
    });

    it('400s on a non-positive box size', async () => {
      const doc = putDoc();
      doc.pages['p1.jpg'].items[0].box = [0, 0, 0, 1];
      const { status, body } = await api(h.baseUrl, '/api/comics/c1/guided', { method: 'PUT', body: doc });
      expect(status).toBe(400);
      expect(body.errors.join(' ')).toMatch(/size/i);
    });

    it('404s for an unknown comic', async () => {
      const { status } = await api(h.baseUrl, '/api/comics/nope/guided', { method: 'PUT', body: putDoc() });
      expect(status).toBe(404);
    });

    it('warns but still writes when the document type disagrees with the inherited type', async () => {
      const h2 = await startHarness({
        comics: [{ id: 'c2', metadata: '{"Series":"Ser"}' }],
        prefs: [{ preferenceType: 'comic', targetId: 'c2', mangaMode: 1 }],
        cbzPages: { c2: ['p1.jpg'] }
      });
      const { status, body } = await api(h2.baseUrl, '/api/comics/c2/guided', { method: 'PUT', body: putDoc() });
      expect(status).toBe(200);
      expect(body.warnings.join(' ')).toMatch(/type|manga/i);
      expect(h2.store.read('c2').type).toBe('manga');
      await h2.close();
    });
  });

  describe('PUT merge semantics', () => {
    // Interleaved bubble order across panels: a full regeneration would reorder
    // the reader-visible sequence, so untouched pages must be kept verbatim.
    const interleavedSidecar = () => ({
      comicId: 'c1',
      type: 'western',
      pages: {
        'p1.jpg': {
          panels: [[0, 0, 100, 100], [0, 100, 100, 100]],
          bubbles: [[10, 10, 20, 20], [10, 110, 20, 20], [90, 10, 10, 10]],
          sequence: [[10, 110, 20, 20], [10, 10, 20, 20], [90, 10, 10, 10]]
        },
        'p2.jpg': {
          panels: [[0, 0, 50, 50], [0, 50, 50, 50]],
          bubbles: [[5, 5, 5, 5], [5, 55, 5, 5], [35, 5, 5, 5]],
          sequence: [[5, 55, 5, 5], [5, 5, 5, 5], [35, 5, 5, 5]]
        }
      }
    });

    let h;
    beforeEach(async () => {
      h = await startHarness({
        comics: [{ id: 'c1', updatedAt: 1000, metadata: '{"Series":"Ser"}' }],
        cbzPages: { c1: ['p1.jpg', 'p2.jpg'] },
        sidecars: { c1: interleavedSidecar() }
      });
    });
    afterEach(() => h.close());

    it('writes an untouched GET -> PUT round trip back byte-identically', async () => {
      const file = path.join(h.config.guidedViewDir, 'c1.json');
      const before = fs.readFileSync(file, 'utf8');

      const get = await api(h.baseUrl, '/api/comics/c1/guided');
      expect(get.status).toBe(200);
      const put = await api(h.baseUrl, '/api/comics/c1/guided', { method: 'PUT', body: get.body });
      expect(put.status).toBe(200);

      expect(fs.readFileSync(file, 'utf8')).toBe(before);
      expect(h.store.read('c1')).toEqual(interleavedSidecar());
    });

    it('canonicalizes only the edited page and keeps the rest verbatim', async () => {
      const get = await api(h.baseUrl, '/api/comics/c1/guided');
      const doc = get.body;
      const p1 = doc.pages['p1.jpg'];
      // Move the first bubble in reading order by one pixel; everything else
      // stays untouched.
      p1.items.find((i) => i.id === p1.order[0]).box = [11, 110, 20, 20];

      const put = await api(h.baseUrl, '/api/comics/c1/guided', { method: 'PUT', body: doc });
      expect(put.status).toBe(200);

      const saved = h.store.read('c1');
      // Edited page: canonical and bubble-only, sequence = the edited order.
      expect(saved.pages['p1.jpg']).toEqual({
        panels: [],
        bubbles: [[11, 110, 20, 20], [10, 10, 20, 20], [90, 10, 10, 10]],
        sequence: [[11, 110, 20, 20], [10, 10, 20, 20], [90, 10, 10, 10]]
      });
      // Untouched page: byte-verbatim (its interleaved sequence survives).
      expect(saved.pages['p2.jpg']).toEqual(interleavedSidecar().pages['p2.jpg']);
    });
  });

  describe('POST reset', () => {
    it('backs up, deletes the sidecar and returns the comic to pending', async () => {
      const h = await startHarness({
        comics: [{ id: 'c1', updatedAt: 1000 }],
        cbzPages: { c1: ['p1.jpg'] },
        sidecars: { c1: westernSidecar() }
      });
      const { status, body } = await api(h.baseUrl, '/api/comics/c1/guided/reset', { method: 'POST' });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(h.store.read('c1')).toBeNull();
      expect(fs.existsSync(body.backupPath)).toBe(true);

      const row = h.db.prepare('SELECT * FROM comics WHERE id = ?').get('c1');
      expect(row.guidedViewStatus).toBe('pending');
      expect(row.guidedViewPath).toBeNull();
      expect(row.updatedAt).toBe(1000);
      await h.close();
    });
  });
});
