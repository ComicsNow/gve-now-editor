const {
  buildExportFile,
  parseExportFile,
  exportFileName,
  FORMAT_VERSION
} = require('../../src/shared/export-file');

const comicRow = {
  id: 'abc123',
  path: '/library/comics/01 Closer to Danger [AAM-Markosia] (2024) #23.cbz',
  name: '01 Closer to Danger [AAM-Markosia] (2024) #23.cbz',
  series: 'Closer to Danger',
  publisher: 'AAM/Markosia',
  metadata: JSON.stringify({ Series: 'Closer to Danger', Number: '23', Volume: '', Year: '2024', Title: '' })
};

const pages = {
  'P00011.jpg': { width: 1988, height: 3056, panels: [[0, 0, 1988, 3056]], bubbles: [], sequence: [[0, 0, 1988, 3056]] }
};

describe('shared/export-file', () => {
  describe('buildExportFile', () => {
    const exp = buildExportFile({
      comic: comicRow,
      type: 'western',
      pages,
      pageOrder: ['P00011.jpg'],
      exportedAt: '2026-10-04T12:00:00.000Z',
      appVersion: '0.1.0'
    });

    it('carries formatVersion, app and exportedAt', () => {
      expect(FORMAT_VERSION).toBe(1);
      expect(exp.formatVersion).toBe(1);
      expect(exp.app).toBe('gve-now/0.1.0');
      expect(exp.exportedAt).toBe('2026-10-04T12:00:00.000Z');
      expect(exp.type).toBe('western');
    });

    it('builds identity fields from the row and its metadata JSON', () => {
      expect(exp.comic.sourceComicId).toBe('abc123');
      expect(exp.comic.series).toBe('Closer to Danger');
      expect(exp.comic.number).toBe('23');
      expect(exp.comic.year).toBe('2024');
      expect(exp.comic.publisher).toBe('AAM/Markosia');
      expect(exp.comic.fileName).toBe('01 Closer to Danger [AAM-Markosia] (2024) #23.cbz');
      expect(exp.comic.fileBaseName).toBe('01 Closer to Danger [AAM-Markosia] (2024) #23');
      expect(exp.comic.pageCount).toBe(1);
    });

    it('never leaks absolute paths', () => {
      expect(exp.comic.path).toBeUndefined();
      expect(JSON.stringify(exp)).not.toContain('/library/');
    });

    it('defaults pageOrder to the pages keys', () => {
      const e2 = buildExportFile({ comic: comicRow, type: 'western', pages });
      expect(e2.pageOrder).toEqual(Object.keys(pages));
    });
  });

  describe('parseExportFile', () => {
    const valid = buildExportFile({ comic: comicRow, type: 'western', pages, pageOrder: ['P00011.jpg'], appVersion: '0.1.0' });

    it('accepts a valid export file', () => {
      const r = parseExportFile(JSON.parse(JSON.stringify(valid)));
      expect(r.ok).toBe(true);
      expect(r.data.type).toBe('western');
      expect(r.data.pages).toEqual(pages);
      expect(r.data.pageOrder).toEqual(['P00011.jpg']);
      expect(r.data.comic.series).toBe('Closer to Danger');
    });

    it('defaults a missing pageOrder to the pages keys', () => {
      const input = { ...valid, pageOrder: undefined };
      const r = parseExportFile(input);
      expect(r.ok).toBe(true);
      expect(r.data.pageOrder).toEqual(Object.keys(pages));
    });

    it('rejects non-objects, wrong versions and bad types', () => {
      expect(parseExportFile(null).ok).toBe(false);
      expect(parseExportFile('{}').ok).toBe(false);
      expect(parseExportFile([]).ok).toBe(false);
      expect(parseExportFile({ ...valid, formatVersion: 2 }).ok).toBe(false);
      expect(parseExportFile({ ...valid, formatVersion: 2 }).error).toMatch(/formatVersion/i);
      expect(parseExportFile({ ...valid, type: 'eastern' }).ok).toBe(false);
      expect(parseExportFile({ ...valid, type: 'eastern' }).error).toMatch(/type/i);
      expect(parseExportFile({ ...valid, pages: null }).ok).toBe(false);
      expect(parseExportFile({ ...valid, pages: [1, 2] }).ok).toBe(false);
    });
  });

  describe('exportFileName', () => {
    it("names the download after the comic's file name (extension swapped)", () => {
      expect(exportFileName('Batman (1940-2011) 474.cbz')).toBe('Batman (1940-2011) 474.json');
      expect(exportFileName('Watchmen.cbr')).toBe('Watchmen.json');
      expect(exportFileName('No Extension')).toBe('No Extension.json');
    });

    it('replaces characters that are illegal in filenames', () => {
      expect(exportFileName('Weird: Name? [v2]*.cbz')).toBe('Weird_ Name_ [v2]_.json');
    });

    it('falls back to export.json for unnamed comics', () => {
      expect(exportFileName('')).toBe('export.json');
      expect(exportFileName(null)).toBe('export.json');
      expect(exportFileName('   ')).toBe('export.json');
    });
  });
});
