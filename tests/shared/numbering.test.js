const {
  normalizeIssueNumber,
  normalizeVolume,
  normalizeYear,
  parseFileNameHints
} = require('../../src/shared/numbering');

describe('shared/numbering', () => {
  describe('normalizeIssueNumber', () => {
    it('canonicalizes numeric forms', () => {
      expect(normalizeIssueNumber('3')).toBe('3');
      expect(normalizeIssueNumber('01')).toBe('1');
      expect(normalizeIssueNumber('003')).toBe('3');
      expect(normalizeIssueNumber('1.0')).toBe('1');
      expect(normalizeIssueNumber('#3')).toBe('3');
      expect(normalizeIssueNumber(' 7 ')).toBe('7');
    });

    it('keeps non-numeric issue designators as trimmed lowercase', () => {
      expect(normalizeIssueNumber('3A')).toBe('3a');
      expect(normalizeIssueNumber('Annual')).toBe('annual');
    });

    it('returns null for empty input', () => {
      expect(normalizeIssueNumber('')).toBeNull();
      expect(normalizeIssueNumber('   ')).toBeNull();
      expect(normalizeIssueNumber(null)).toBeNull();
      expect(normalizeIssueNumber(undefined)).toBeNull();
    });
  });

  describe('normalizeVolume', () => {
    it('canonicalizes volume forms', () => {
      expect(normalizeVolume('2')).toBe('2');
      expect(normalizeVolume('02')).toBe('2');
      expect(normalizeVolume('Vol. 2')).toBe('2');
      expect(normalizeVolume('v2')).toBe('2');
      expect(normalizeVolume('Volume 10')).toBe('10');
    });

    it('returns null for empty input', () => {
      expect(normalizeVolume('')).toBeNull();
      expect(normalizeVolume(null)).toBeNull();
    });
  });

  describe('normalizeYear', () => {
    it('extracts a 4-digit 19xx/20xx year', () => {
      expect(normalizeYear('2024')).toBe('2024');
      expect(normalizeYear(' 1991 ')).toBe('1991');
      expect(normalizeYear('reprint 2016 edition')).toBe('2016');
    });

    it('returns null for non-year values', () => {
      expect(normalizeYear('99')).toBeNull();
      expect(normalizeYear('')).toBeNull();
      expect(normalizeYear(null)).toBeNull();
      expect(normalizeYear('1899')).toBeNull();
    });
  });

  describe('parseFileNameHints', () => {
    it('extracts series, number, year and volume from a release filename', () => {
      expect(parseFileNameHints('01 Closer to Danger [AAM-Markosia] (2024) #23.cbz')).toEqual({
        series: 'Closer to Danger',
        number: '23',
        year: '2024',
        volume: null
      });
    });

    it('handles volume markers and non-cbz extensions', () => {
      expect(parseFileNameHints('Saga Vol. 3 (2014) #12.cbr')).toEqual({
        series: 'Saga',
        number: '12',
        year: '2014',
        volume: '3'
      });
    });

    it('returns nulls when hints are absent', () => {
      expect(parseFileNameHints('Watchmen.cbz')).toEqual({
        series: 'Watchmen',
        number: null,
        year: null,
        volume: null
      });
    });
  });
});
