const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { startHarness, PNG_1PX } = require('../../helpers/app-harness');
const { api } = require('../../helpers/api');
const { webpCacheKey } = require('../../../src/server/page-webp');

describe('routes/comics', () => {
  let h;
  beforeAll(async () => {
    h = await startHarness({
      comics: [
        { id: 'c1', series: 'Closer to Danger', guidedViewStatus: 'completed', metadata: '{"Series":"Closer to Danger","Number":"1"}' },
        { id: 'c2', series: 'Berserk', metadata: '{"Series":"Berserk","Number":"1"}' }
      ],
      prefs: [{ preferenceType: 'comic', targetId: 'c1', mangaMode: 1 }],
      cbzPages: { c1: ['p1.png', 'p2.png'], c2: ['p1.png'] },
      sidecars: {
        c1: { comicId: 'c1', type: 'western', pages: { 'p1.png': { panels: [[0, 0, 1, 1]], bubbles: [], sequence: [[0, 0, 1, 1]] } } }
      }
    });
  });
  afterAll(() => h.close());

  it('lists comics with resolved mangaMode', async () => {
    const { status, body } = await api(h.baseUrl, '/api/comics?q=danger');
    expect(status).toBe(200);
    expect(body.comics.length).toBe(1);
    expect(body.comics[0].id).toBe('c1');
    expect(body.comics[0].mangaMode).toBe(true);
    expect(body.comics[0].metadata.Number).toBe('1');
  });

  it('returns total and honors validated limit/offset', async () => {
    const all = await api(h.baseUrl, '/api/comics');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);
    expect(all.body.comics).toHaveLength(2);
    expect(all.body.limit).toBe(50);
    expect(all.body.offset).toBe(0);

    // ORDER BY series, name -> [Berserk(c2), Closer to Danger(c1)]
    const page = await api(h.baseUrl, '/api/comics?limit=1&offset=1');
    expect(page.status).toBe(200);
    expect(page.body.total).toBe(2);
    expect(page.body.comics.map((c) => c.id)).toEqual(['c1']);
    expect(page.body.limit).toBe(1);
    expect(page.body.offset).toBe(1);
  });

  it('rejects invalid limit/offset with 400 instead of 500ing', async () => {
    for (const qs of ['limit=abc', 'limit=0', 'limit=101', 'limit=1.5', 'offset=-1', 'offset=1.5']) {
      const res = await api(h.baseUrl, `/api/comics?${qs}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/limit|offset/i);
    }
  });

  it('returns one comic with mangaMode, or 404', async () => {
    const ok = await api(h.baseUrl, '/api/comics/c2');
    expect(ok.status).toBe(200);
    expect(ok.body.comic.series).toBe('Berserk');
    expect(ok.body.mangaMode).toBe(false);

    expect((await api(h.baseUrl, '/api/comics/nope')).status).toBe(404);
  });

  it('lists CBZ pages with dimensions and sidecar status', async () => {
    const c1 = await api(h.baseUrl, '/api/comics/c1/pages');
    expect(c1.status).toBe(200);
    expect(c1.body.pages.map((p) => p.name)).toEqual(['p1.png', 'p2.png']);
    expect(c1.body.pages[0]).toMatchObject({ index: 0, name: 'p1.png', width: 1, height: 1 });
    expect(c1.body.sidecarType).toBe('western');
    expect(c1.body.hasSidecar).toBe(true);

    const c2 = await api(h.baseUrl, '/api/comics/c2/pages');
    expect(c2.body.hasSidecar).toBe(false);
    expect(c2.body.sidecarType).toBe('western');
  });

  it('serves page images with a weak ETag and 304 on revalidation', async () => {
    const first = await api(h.baseUrl, '/api/comics/c1/page-image?page=p1.png');
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('image/png');
    expect(first.headers.get('cache-control')).toBe('private, max-age=300');
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    const sent = Buffer.from(await (await fetch(`${h.baseUrl}/api/comics/c1/page-image?page=p1.png`)).arrayBuffer());
    expect(sent.equals(PNG_1PX)).toBe(true);
    expect(crypto.createHash('sha1').update(sent).digest('hex')).toBe(crypto.createHash('sha1').update(PNG_1PX).digest('hex'));

    const revalidated = await api(h.baseUrl, '/api/comics/c1/page-image?page=p1.png', { headers: { 'if-none-match': etag } });
    expect(revalidated.status).toBe(304);
  });

  it('404s page images for unknown pages and comics', async () => {
    expect((await api(h.baseUrl, '/api/comics/c1/page-image?page=nope.png')).status).toBe(404);
    expect((await api(h.baseUrl, '/api/comics/nope/page-image?page=p1.png')).status).toBe(404);
  });

  it('lists only comics with a completed guided view when status=completed', async () => {
    const res = await api(h.baseUrl, '/api/comics?status=completed');
    expect(res.status).toBe(200);
    expect(res.body.comics.map((c) => c.id)).toEqual(['c1']);
  });

  it('serves a full-res webp from the shared page cache when present', async () => {
    const row = h.db.prepare('SELECT path FROM comics WHERE id = ?').get('c1');
    const key = webpCacheKey(row.path, fs.statSync(row.path).mtimeMs, 'p1.png');
    fs.mkdirSync(h.config.pageCacheDir, { recursive: true });
    const webpBytes = Buffer.from('FAKE-WEBP-BYTES');
    fs.writeFileSync(path.join(h.config.pageCacheDir, key), webpBytes);

    const res = await fetch(`${h.baseUrl}/api/comics/c1/page-image?page=p1.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await res.arrayBuffer()).equals(webpBytes)).toBe(true);

    const again = await fetch(`${h.baseUrl}/api/comics/c1/page-image?page=p1.png`, {
      headers: { 'if-none-match': res.headers.get('etag') }
    });
    expect(again.status).toBe(304);
  });
});
