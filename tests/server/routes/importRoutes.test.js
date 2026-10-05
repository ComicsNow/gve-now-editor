const { startHarness } = require('../../helpers/app-harness');
const { api } = require('../../helpers/api');
const { buildExportFile } = require('../../../src/shared/export-file');

const baseFile = () => buildExportFile({
  comic: {
    id: 'orig',
    series: 'Ser',
    name: 'Ser 01.cbz',
    metadata: JSON.stringify({ Series: 'Ser', Number: '1', Year: '2024' })
  },
  type: 'western',
  pages: {
    'p1.jpg': { width: 1, height: 1, panels: [[0, 0, 1, 1]], bubbles: [[0, 0, 1, 1]], sequence: [[0, 0, 1, 1]] },
    'p2.jpg': { width: 1, height: 1, panels: [[0, 0, 1, 1]], bubbles: [], sequence: [[0, 0, 1, 1]] }
  },
  pageOrder: ['p1.jpg', 'p2.jpg'],
  exportedAt: '2026-10-04T00:00:00.000Z',
  appVersion: '0.1.0'
});

const partialFile = () => {
  const f = baseFile();
  delete f.pages['p2.jpg'];
  f.pageOrder = ['p1.jpg'];
  return f;
};

const cloneSidecar = {
  comicId: 'clone',
  type: 'western',
  pages: {
    'p1.jpg': { panels: [[0, 0, 1, 1]], bubbles: [], sequence: [[0, 0, 1, 1]] },
    'p2.jpg': { panels: [[0, 0, 1, 1]], bubbles: [[0, 0, 1, 1]], sequence: [[0, 0, 1, 1]] }
  }
};

const makeHarness = () => startHarness({
  comics: [
    { id: 'orig', series: 'Ser', name: 'Ser 01.cbz', totalPages: 2, metadata: '{"Series":"Ser","Number":"1","Year":"2024"}' },
    { id: 'clone', series: 'Ser', name: 'Ser 01 copy.cbz', totalPages: 2, metadata: '{"Series":"Ser","Number":"1","Year":"2024"}' },
    { id: 'far', series: 'AAA Nonsense', name: 'AAA 9.cbz', totalPages: 5, metadata: '{"Series":"AAA Nonsense","Number":"9"}' }
  ],
  cbzPages: { orig: ['p1.jpg', 'p2.jpg'], clone: ['p1.jpg', 'p2.jpg'], far: ['p1.jpg'] },
  sidecars: { clone: cloneSidecar }
});

describe('routes/import', () => {
  let h;
  beforeAll(async () => {
    h = await makeHarness();
  });
  afterAll(() => h.close());

  describe('POST /api/import/score', () => {
    it('ranks candidates by score and drops unrelated series', async () => {
      const { status, body } = await api(h.baseUrl, '/api/import/score', { method: 'POST', body: { file: baseFile() } });
      expect(status).toBe(200);
      expect(body.candidates[0].comic.id).toBe('orig');
      expect(body.candidates[0].sourceComicIdMatch).toBe(true);
      expect(body.candidates.some((c) => c.comic.id === 'clone')).toBe(true);
      expect(body.candidates.some((c) => c.comic.id === 'far')).toBe(false);
      expect(typeof body.candidates[0].comic.mangaMode).toBe('boolean');
      expect(body.candidates[0].breakdown).toBeDefined();
    });

    it('400s on an invalid export file', async () => {
      const { status, body } = await api(h.baseUrl, '/api/import/score', { method: 'POST', body: { file: { formatVersion: 99 } } });
      expect(status).toBe(400);
      expect(String(body.error)).toMatch(/formatVersion/i);
    });
  });

  describe('POST /api/import/score-against', () => {
    it('scores one manually chosen comic', async () => {
      const { status, body } = await api(h.baseUrl, '/api/import/score-against', { method: 'POST', body: { file: baseFile(), comicId: 'clone' } });
      expect(status).toBe(200);
      expect(body.score).toBeGreaterThan(0.5);
      expect(body.sourceComicIdMatch).toBe(false);
      expect(body.mangaMode).toBe(false);
      expect(body.breakdown.series.score).toBe(1);
    });

    it('404s for an unknown comic', async () => {
      const { status } = await api(h.baseUrl, '/api/import/score-against', { method: 'POST', body: { file: baseFile(), comicId: 'nope' } });
      expect(status).toBe(404);
    });
  });

  describe('POST /api/import/apply', () => {
    it('attach keeps existing pages the file does not cover', async () => {
      const { status, body } = await api(h.baseUrl, '/api/import/apply', { method: 'POST', body: { file: partialFile(), comicId: 'clone', mode: 'attach' } });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.backupPath).toBeTruthy();
      expect(body.summary).toMatchObject({ exact: 1, emptyTarget: 1 });

      const saved = h.store.read('clone');
      // The attached file still carries legacy scaffold panels; the written
      // page is canonical — panels are dropped once bubbles exist.
      expect(saved.pages['p1.jpg']).toEqual({ panels: [], bubbles: [[0, 0, 1, 1]], sequence: [[0, 0, 1, 1]] });
      expect(saved.pages['p2.jpg']).toEqual(cloneSidecar.pages['p2.jpg']);
      expect(h.db.prepare('SELECT guidedViewStatus FROM comics WHERE id = ?').get('clone').guidedViewStatus).toBe('completed');
    });

    it('attach keeps untouched pages byte-verbatim (interleaved order survives)', async () => {
      const h3 = await makeHarness();
      // Interleaved bubble order across panels: canonical regeneration would
      // reorder it, so attach must leave the untouched page exactly as it was.
      const interleaved = () => ({
        panels: [[0, 0, 100, 100], [0, 100, 100, 100]],
        bubbles: [[10, 10, 20, 20], [10, 110, 20, 20], [90, 10, 10, 10]],
        sequence: [[10, 110, 20, 20], [10, 10, 20, 20], [90, 10, 10, 10]]
      });
      try {
        h3.store.write('clone', {
          comicId: 'clone',
          type: 'western',
          pages: { 'p1.jpg': cloneSidecar.pages['p1.jpg'], 'p2.jpg': interleaved() }
        });

        const { status } = await api(h3.baseUrl, '/api/import/apply', { method: 'POST', body: { file: partialFile(), comicId: 'clone', mode: 'attach' } });
        expect(status).toBe(200);

        const saved = h3.store.read('clone');
        expect(saved.pages['p2.jpg']).toEqual(interleaved());
      } finally {
        await h3.close();
      }
    });

    it('replace clears pages the file does not cover', async () => {
      // fresh harness so the previous test's attach does not leak state
      const h2 = await makeHarness();
      const { status, body } = await api(h2.baseUrl, '/api/import/apply', { method: 'POST', body: { file: partialFile(), comicId: 'clone', mode: 'replace' } });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);

      const saved = h2.store.read('clone');
      expect(saved.pages['p1.jpg'].bubbles).toEqual([[0, 0, 1, 1]]);
      expect(saved.pages['p2.jpg']).toEqual({ panels: [], bubbles: [], sequence: [] });
      await h2.close();
    });

    it('400s on an invalid file and 404s on an unknown comic', async () => {
      const bad = await api(h.baseUrl, '/api/import/apply', { method: 'POST', body: { file: { type: 'eastern' }, comicId: 'clone', mode: 'attach' } });
      expect(bad.status).toBe(400);
      const missing = await api(h.baseUrl, '/api/import/apply', { method: 'POST', body: { file: baseFile(), comicId: 'nope', mode: 'attach' } });
      expect(missing.status).toBe(404);
    });
  });
});
