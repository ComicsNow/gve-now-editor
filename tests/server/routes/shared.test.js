const { mimeFor, appendMissing, canonicalType, loadComic } = require('../../../src/server/routes/shared');
const { createTestDb, insertComic, insertPref } = require('../../helpers/test-db');

describe('shared', () => {
  describe('mimeFor', () => {
    it('returns correct mime type for known extensions', () => {
      expect(mimeFor('image.jpg')).toBe('image/jpeg');
      expect(mimeFor('image.jpeg')).toBe('image/jpeg');
      expect(mimeFor('image.png')).toBe('image/png');
      expect(mimeFor('image.gif')).toBe('image/gif');
      expect(mimeFor('image.webp')).toBe('image/webp');
      expect(mimeFor('image.avif')).toBe('image/avif');
      expect(mimeFor('IMAGE.JPG')).toBe('image/jpeg');
    });

    it('returns default mime type for unknown or missing extensions', () => {
      expect(mimeFor('file.txt')).toBe('application/octet-stream');
      expect(mimeFor('file')).toBe('application/octet-stream');
    });
  });

  describe('appendMissing', () => {
    it('appends missing elements', () => {
      expect(appendMissing(['a', 'b'], ['c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
    });

    it('does not append existing elements', () => {
      expect(appendMissing(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('handles empty arrays', () => {
      expect(appendMissing([], ['a'])).toEqual(['a']);
      expect(appendMissing(['a'], [])).toEqual(['a']);
      expect(appendMissing([], [])).toEqual([]);
    });
  });

  describe('canonicalType', () => {
    const store = {
      read: (id) => {
        if (id === 'manga-sidecar') return { type: 'manga' };
        if (id === 'western-sidecar') return { type: 'western' };
        if (id === 'unknown-sidecar') return { type: 'unknown' };
        return null;
      }
    };

    it('uses sidecar type if valid', () => {
      expect(canonicalType(store, 'manga-sidecar', false)).toBe('manga');
      expect(canonicalType(store, 'western-sidecar', true)).toBe('western');
    });

    it('derives from mangaMode if sidecar missing or invalid type', () => {
      expect(canonicalType(store, 'unknown-sidecar', true)).toBe('manga');
      expect(canonicalType(store, 'unknown-sidecar', false)).toBe('western');
      expect(canonicalType(store, 'no-sidecar', true)).toBe('manga');
      expect(canonicalType(store, 'no-sidecar', false)).toBe('western');
    });
  });

  describe('loadComic', () => {
    let db;
    const config = { prefsUserId: 'user1', libraries: ['/libs/A'] };

    beforeEach(() => {
      db = createTestDb(':memory:');
    });

    afterEach(() => {
      db.close();
    });

    it('returns null if comic not found', () => {
      expect(loadComic(db, config, 'unknown-id')).toBeNull();
    });

    it('loads comic and resolves mangaMode to true if set in preferences', () => {
      insertComic(db, { id: 'c1' });
      insertPref(db, { userId: 'user1', preferenceType: 'comic', targetId: 'c1', mangaMode: 1 });
      const result = loadComic(db, config, 'c1');
      expect(result).not.toBeNull();
      expect(result.comic.id).toBe('c1');
      expect(result.mangaMode).toBe(true);
    });

    it('loads comic and resolves mangaMode to false if default', () => {
      insertComic(db, { id: 'c2' });
      const result = loadComic(db, config, 'c2');
      expect(result).not.toBeNull();
      expect(result.comic.id).toBe('c2');
      expect(result.mangaMode).toBe(false);
    });
  });
});