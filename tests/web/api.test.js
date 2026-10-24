const { api } = require('../../src/web/api');

describe('api', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('request methods', () => {
    beforeEach(() => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({})
      });
    });

    it('health', async () => {
      await api.health();
      expect(global.fetch).toHaveBeenCalledWith('/api/health', undefined);
    });

    it('listComics with defaults', async () => {
      await api.listComics();
      expect(global.fetch).toHaveBeenCalledWith('/api/comics?q=&status=&limit=100&offset=0', undefined);
    });

    it('listComics with params', async () => {
      await api.listComics({ q: 'batman', status: 'read', limit: 10, offset: 5 });
      expect(global.fetch).toHaveBeenCalledWith('/api/comics?q=batman&status=read&limit=10&offset=5', undefined);
    });

    it('getComic', async () => {
      await api.getComic('123');
      expect(global.fetch).toHaveBeenCalledWith('/api/comics/123', undefined);
    });

    it('pages', async () => {
      await api.pages('123');
      expect(global.fetch).toHaveBeenCalledWith('/api/comics/123/pages', undefined);
    });

    it('pageImageUrl', () => {
      const url = api.pageImageUrl('123', 'page 1');
      expect(url).toBe('/api/comics/123/page-image?page=page%201');
    });

    it('guided', async () => {
      await api.guided('123');
      expect(global.fetch).toHaveBeenCalledWith('/api/comics/123/guided', undefined);
    });

    it('saveGuided', async () => {
      await api.saveGuided('123', { data: 'test' });
      expect(global.fetch).toHaveBeenCalledWith('/api/comics/123/guided', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' })
      });
    });

    it('resetGuided', async () => {
      await api.resetGuided('123');
      expect(global.fetch).toHaveBeenCalledWith('/api/comics/123/guided/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
    });

    it('exportUrl', () => {
      const url = api.exportUrl('123');
      expect(url).toBe('/api/comics/123/export');
    });

    it('getSettings', async () => {
      await api.getSettings();
      expect(global.fetch).toHaveBeenCalledWith('/api/settings', undefined);
    });

    it('saveSettings', async () => {
      await api.saveSettings({ theme: 'dark' });
      expect(global.fetch).toHaveBeenCalledWith('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: 'dark' })
      });
    });

    it('scoreImport', async () => {
      await api.scoreImport('test-file');
      expect(global.fetch).toHaveBeenCalledWith('/api/import/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: 'test-file' })
      });
    });

    it('scoreAgainst', async () => {
      await api.scoreAgainst('test-file', '123');
      expect(global.fetch).toHaveBeenCalledWith('/api/import/score-against', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: 'test-file', comicId: '123' })
      });
    });

    it('applyImport', async () => {
      await api.applyImport('test-file', '123', 'mode1');
      expect(global.fetch).toHaveBeenCalledWith('/api/import/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: 'test-file', comicId: '123', mode: 'mode1' })
      });
    });
  });

  describe('error handling and response parsing', () => {
    it('performs successful GET requests and parses JSON', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' })
      });

      const result = await api.health();
      expect(result).toEqual({ status: 'ok' });
    });

    it('handles responses that cannot be parsed as JSON gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('invalid json'); }
      });

      const result = await api.health();
      expect(result).toBeNull();
    });

    it('handles HTTP error responses and extracts data.errors', async () => {
      const errorData = { errors: ['first error', 'second error'] };
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => errorData
      });

      await expect(api.health()).rejects.toMatchObject({
        message: 'first error; second error',
        status: 400,
        data: errorData
      });
    });

    it('handles HTTP error responses and extracts data.error', async () => {
      const errorData = { error: 'single error' };
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => errorData
      });

      await expect(api.health()).rejects.toMatchObject({
        message: 'single error',
        status: 403,
        data: errorData
      });
    });

    it('handles HTTP error responses and falls back to HTTP [status]', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error('invalid json'); }
      });

      await expect(api.health()).rejects.toMatchObject({
        message: 'HTTP 500',
        status: 500,
        data: null
      });
    });
  });
});
