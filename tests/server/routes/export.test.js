const { startHarness } = require('../../helpers/app-harness');
const { api } = require('../../helpers/api');
const { contentDisposition } = require('../../../src/server/routes/exportRoute');

const sidecar = {
  comicId: 'c1',
  type: 'western',
  pages: {
    'p1.jpg': { panels: [[0, 0, 1, 1]], bubbles: [], sequence: [[0, 0, 1, 1]] },
    'p2.jpg': { panels: [[0, 0, 1, 1]], bubbles: [[0, 0, 1, 1]], sequence: [[0, 0, 1, 1]] }
  }
};

describe('routes/export', () => {
  let h;
  beforeAll(async () => {
    h = await startHarness({
      comics: [{ id: 'c1', series: 'Ser', metadata: '{"Series":"Ser","Number":"1","Year":"2024"}' }],
      cbzPages: { c1: ['p1.jpg', 'p2.jpg'] },
      sidecars: { c1: sidecar }
    });
  });
  afterAll(() => h.close());

  it('builds a portable export file with identity, page order and no paths', async () => {
    const { status, body, text } = await api(h.baseUrl, '/api/comics/c1/export');
    expect(status).toBe(200);
    expect(body.formatVersion).toBe(1);
    expect(body.type).toBe('western');
    expect(body.comic.sourceComicId).toBe('c1');
    expect(body.comic.series).toBe('Ser');
    expect(body.comic.number).toBe('1');
    expect(body.comic.year).toBe('2024');
    expect(body.comic.fileName).toBe('c1.cbz');
    expect(body.pageOrder).toEqual(['p1.jpg', 'p2.jpg']);
    expect(body.pages['p2.jpg']).toEqual(sidecar.pages['p2.jpg']);
    expect(text).not.toContain(h.dir);
    expect(text).not.toContain('/media/');
  });

  it("names the download after the comic file, not export.json", async () => {
    const { headers } = await api(h.baseUrl, '/api/comics/c1/export');
    expect(headers.get('content-disposition')).toBe('attachment; filename="c1.json"');
  });

  it('encodes non-ASCII comic names for the header (RFC 5987)', async () => {
    const h3 = await startHarness({
      comics: [{ id: 'c3', name: 'Ünïcode Ångström.cbz', metadata: '{}' }],
      cbzPages: { c3: ['p1.jpg'] },
      sidecars: { c3: { ...sidecar, comicId: 'c3' } }
    });
    const { status, headers } = await api(h3.baseUrl, '/api/comics/c3/export');
    expect(status).toBe(200);
    const cd = headers.get('content-disposition');
    expect(cd).toContain('filename="_n_code _ngstr_m.json"');
    expect(cd).toContain(`filename*=UTF-8''${encodeURIComponent('Ünïcode Ångström.json')}`);
    await h3.close();
  });

  it('404s when the comic has no guided view data', async () => {
    const h2 = await startHarness({
      comics: [{ id: 'c9', metadata: '{}' }],
      cbzPages: { c9: ['p1.jpg'] }
    });
    const { status, body } = await api(h2.baseUrl, '/api/comics/c9/export');
    expect(status).toBe(404);
    expect(String(body.error)).toMatch(/guided|sidecar/i);
    await h2.close();
  });
});

describe('contentDisposition', () => {
  it('returns standard attachment format for pure ASCII filenames', () => {
    expect(contentDisposition('comic.cbz')).toBe('attachment; filename="comic.cbz"');
    expect(contentDisposition('123 abc.json')).toBe('attachment; filename="123 abc.json"');
  });

  it('replaces quotes and backslashes with underscores', () => {
    expect(contentDisposition('comic"quote".cbz')).toBe('attachment; filename="comic_quote_.cbz"');
    expect(contentDisposition('backslash\\file.cbz')).toBe('attachment; filename="backslash_file.cbz"');
    expect(contentDisposition('mix"ed\\characters.cbz')).toBe('attachment; filename="mix_ed_characters.cbz"');
  });

  it('generates ASCII fallback and RFC 5987 encoded filename* for non-ASCII characters', () => {
    expect(contentDisposition('Ünïcode Ångström.cbz')).toBe(
      'attachment; filename="_n_code _ngstr_m.cbz"; filename*=UTF-8\'\'%C3%9Cn%C3%AFcode%20%C3%85ngstr%C3%B6m.cbz'
    );
    expect(contentDisposition('漫画.cbz')).toBe(
      'attachment; filename="__.cbz"; filename*=UTF-8\'\'%E6%BC%AB%E7%94%BB.cbz'
    );
  });

  it('handles characters requiring URI encoding like % and \'', () => {
    expect(contentDisposition('100% \'free\'.cbz')).toBe(
      'attachment; filename="100% \'free\'.cbz"'
    );
    expect(contentDisposition('Ünïcode 100% \'free\'.cbz')).toBe(
      'attachment; filename="_n_code 100% \'free\'.cbz"; filename*=UTF-8\'\'%C3%9Cn%C3%AFcode%20100%25%20\'free\'.cbz'
    );
  });

  it('handles edge cases like empty strings and strings with only spaces', () => {
    expect(contentDisposition('')).toBe('attachment; filename=""');
    expect(contentDisposition('   ')).toBe('attachment; filename="   "');
  });
});
