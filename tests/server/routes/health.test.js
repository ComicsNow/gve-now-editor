const { startHarness } = require('../../helpers/app-harness');
const { api } = require('../../helpers/api');

describe('routes/health', () => {
  let h;
  beforeAll(async () => {
    h = await startHarness({
      comics: [{ id: 'c1', metadata: '{}' }],
      cbzPages: { c1: ['p1.jpg'] },
      sidecars: {
        c1: { comicId: 'c1', type: 'western', pages: {} },
        orphaned: { comicId: 'orphaned', type: 'manga', pages: {} }
      }
    });
  });
  afterAll(() => h.close());

  it('reports config, DB census and sidecar census including orphans', async () => {
    const { status, body } = await api(h.baseUrl, '/api/health');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.db.comics).toBe(1);
    expect(body.sidecars.total).toBe(2);
    expect(body.sidecars.orphans).toBe(1);
    expect(body.config.dbPath).toBe(h.config.dbPath);
    expect(body.config.guidedViewDir).toBe(h.config.guidedViewDir);
  });
});
