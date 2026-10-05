const { scoreCandidate, rankCandidates } = require('../../src/server/match');

const exportComic = {
  sourceComicId: 'abc',
  series: 'Closer to Danger',
  number: '23',
  year: '2024',
  fileName: '01 Closer to Danger [AAM-Markosia] (2024) #23.cbz',
  fileBaseName: '01 Closer to Danger [AAM-Markosia] (2024) #23',
  pageCount: 24
};

const candidate = (overrides = {}) => ({
  id: 'cand',
  series: 'Closer to Danger',
  name: '01 Closer to Danger [AAM-Markosia] (2024) #23.cbz',
  totalPages: 24,
  metadata: { Series: 'Closer to Danger', Number: '23', Year: '2024' },
  ...overrides
});

describe('server/match', () => {
  describe('scoreCandidate', () => {
    it('gives an exact sourceComicId match a full score with a flag', () => {
      const r = scoreCandidate(exportComic, candidate({ id: 'abc', series: 'Something Else', metadata: {} }));
      expect(r.score).toBe(1);
      expect(r.sourceComicIdMatch).toBe(true);
    });

    it('scores a perfect identity match as 1 with a full breakdown', () => {
      const r = scoreCandidate(exportComic, candidate());
      expect(r.score).toBe(1);
      expect(r.sourceComicIdMatch).toBe(false);
      expect(r.breakdown.series.score).toBe(1);
      expect(r.breakdown.number.score).toBe(1);
      expect(r.breakdown.year.score).toBe(1);
      expect(r.breakdown.pageCount.score).toBe(1);
      expect(r.breakdown.fileName.score).toBeGreaterThan(0.9);
    });

    it('scores partial components: wrong number, +/-1 year, +/-2 pages', () => {
      const r = scoreCandidate(exportComic, candidate({
        metadata: { Series: 'Closer to Danger', Number: '24', Year: '2025' },
        totalPages: 26
      }));
      expect(r.breakdown.number.score).toBe(0);
      expect(r.breakdown.year.score).toBe(0.5);
      expect(r.breakdown.pageCount.score).toBe(0.7);
      expect(r.score).toBeLessThan(1);
      expect(r.score).toBeGreaterThan(0.6);
    });

    it('renormalizes weights over present components only', () => {
      const r = scoreCandidate(exportComic, candidate({ metadata: { Series: 'Closer to Danger' }, totalPages: null }));
      expect(r.breakdown.number).toBeUndefined();
      expect(r.breakdown.year).toBeUndefined();
      expect(r.breakdown.pageCount).toBeUndefined();
      expect(r.breakdown.series.score).toBe(1);
      expect(r.breakdown.fileName.score).toBeGreaterThan(0.9);
      expect(r.score).toBeGreaterThan(0.9);
    });

    it('falls back to the file name when a series is missing', () => {
      const r = scoreCandidate(
        { ...exportComic, series: null },
        candidate({ series: null, metadata: {}, name: 'Closer to Danger [AAM-Markosia] (2024) #23.cbz' })
      );
      expect(r.breakdown.series.score).toBeGreaterThan(0.5);
    });

    it('normalizes issue numbers before comparing', () => {
      const r = scoreCandidate(exportComic, candidate({ metadata: { Series: 'Closer to Danger', Number: '023', Year: '2024' } }));
      expect(r.breakdown.number.score).toBe(1);
    });
  });

  describe('rankCandidates', () => {
    it('drops candidates whose series similarity is below 0.4 and sorts by score', () => {
      const ranked = rankCandidates(exportComic, [
        candidate({ id: 'unrelated', series: 'Space Pirates', metadata: { Series: 'Space Pirates', Number: '1' }, name: 'Space Pirates 01.cbz' }),
        candidate({ id: 'wrong-year', metadata: { Series: 'Closer to Danger', Number: '23', Year: '2019' } }),
        candidate({ id: 'exact' })
      ]);
      expect(ranked.map((r) => r.comic.id)).toEqual(['exact', 'wrong-year']);
    });

    it('limits results and keeps the breakdown for display', () => {
      const many = Array.from({ length: 8 }, (_, i) => candidate({ id: `c${i}`, metadata: { Series: 'Closer to Danger', Number: `${i}`, Year: '2024' } }));
      const ranked = rankCandidates(exportComic, many, { limit: 5 });
      expect(ranked.length).toBe(5);
      expect(ranked[0].breakdown.series.score).toBe(1);
    });

    it('ranks an exact sourceComicId match first regardless of metadata drift', () => {
      const ranked = rankCandidates(exportComic, [
        candidate({ id: 'rename', series: 'Totally Renamed', metadata: {}, name: 'x.cbz' }),
        candidate({ id: 'abc', series: 'Totally Renamed', metadata: {}, name: 'x.cbz' })
      ]);
      expect(ranked[0].comic.id).toBe('abc');
      expect(ranked[0].score).toBe(1);
    });
  });
});
