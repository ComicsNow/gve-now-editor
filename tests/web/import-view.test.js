/**
 * @jest-environment jsdom
 */
const { createImportView } = require('../../src/web/import-view');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const FILE_DATA = {
  formatVersion: 1,
  type: 'western',
  comic: { series: 'Alpha', fileName: 'Alpha 01.cbz' },
  pages: {}
};

function makeApi() {
  return {
    scoreImport: jest.fn(async () => ({
      type: 'western',
      comic: FILE_DATA.comic,
      candidates: [
        {
          comic: { id: 'c1', series: 'Alpha', name: 'Alpha 01.cbz', mangaMode: false },
          score: 0.9,
          sourceComicIdMatch: true,
          breakdown: { series: 1, number: 1 }
        },
        {
          comic: { id: 'c2', series: 'Alfa', name: 'Alfa.cbz', mangaMode: false },
          score: 0.55,
          sourceComicIdMatch: false,
          breakdown: { series: 0.9 }
        }
      ]
    })),
    scoreAgainst: jest.fn(async () => ({ score: 0.42, sourceComicIdMatch: false, breakdown: { series: 0.8 }, mangaMode: false })),
    listComics: jest.fn(async () => ({ comics: [] })),
    applyImport: jest.fn(async () => ({
      ok: true,
      summary: { exact: 3, ci: 0, basename: 1, positional: 0, dropped: 0, emptyTarget: 0, scaled: 2, clamped: 1 },
      warnings: [],
      backupPath: '/b/x.json',
      sidecarPath: '/s/x.json'
    }))
  };
}

describe('web/import-view', () => {
  it('scores a loaded file and renders the confirm screen', async () => {
    const el = document.createElement('div');
    const api = makeApi();
    const view = createImportView(el, { api });
    await view.loadFile(FILE_DATA);

    expect(api.scoreImport).toHaveBeenCalledWith(FILE_DATA);
    const rows = el.querySelectorAll('.candidate-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('0.90');
    expect(rows[0].querySelector('.source-match')).toBeTruthy();
    expect(rows[0].querySelector('input[type="radio"]').checked).toBe(true);
    expect(rows[1].querySelector('input[type="radio"]').checked).toBe(false);
  });

  it('applies with the selected candidate and mode, then shows the summary', async () => {
    const el = document.createElement('div');
    const api = makeApi();
    const view = createImportView(el, { api });
    await view.loadFile(FILE_DATA);

    el.querySelector('input[name="import-mode"][value="replace"]').checked = true;
    el.querySelector('.apply').click();
    await flush();

    expect(api.applyImport).toHaveBeenCalledWith(FILE_DATA, 'c1', 'replace');
    const result = el.querySelector('.import-result');
    expect(result.textContent).toMatch(/exact: 3/);
    expect(result.textContent).toContain('/b/x.json');
  });

  it('lets the user pick another candidate', async () => {
    const el = document.createElement('div');
    const api = makeApi();
    const view = createImportView(el, { api });
    await view.loadFile(FILE_DATA);

    const second = el.querySelectorAll('.candidate-row')[1].querySelector('input[type="radio"]');
    second.checked = true;
    second.dispatchEvent(new Event('change', { bubbles: true }));
    el.querySelector('.apply').click();
    await flush();

    expect(api.applyImport).toHaveBeenCalledWith(FILE_DATA, 'c2', 'attach');
  });

  it('surfaces scoring errors', async () => {
    const el = document.createElement('div');
    const api = makeApi();
    api.scoreImport = jest.fn(async () => { throw new Error('bad import file'); });
    const view = createImportView(el, { api });
    await view.loadFile(FILE_DATA);
    expect(el.querySelector('.import-status').textContent).toContain('bad import file');
  });
});
