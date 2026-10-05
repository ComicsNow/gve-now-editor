const path = require('path');
const { searchComics, countComics, getComic, parseMetadata, resolveMangaMode } = require('../../src/server/comics-repo');
const { createTestDb, insertComic, insertPref } = require('../helpers/test-db');
const { tmpDir, rmrf } = require('../helpers/tmp');

describe('server/comics-repo', () => {
  let dir;
  let db;

  beforeEach(() => {
    dir = tmpDir();
    db = createTestDb(path.join(dir, 'comics-now.db'));
  });
  afterEach(() => {
    db.close();
    rmrf(dir);
  });

  describe('parseMetadata', () => {
    it('parses JSON strings and tolerates missing/bad values', () => {
      expect(parseMetadata('{"Series":"X","Number":"3"}')).toEqual({ Series: 'X', Number: '3' });
      expect(parseMetadata(null)).toEqual({});
      expect(parseMetadata('not json')).toEqual({});
      expect(parseMetadata({ Series: 'Y' })).toEqual({ Series: 'Y' });
    });
  });

  describe('searchComics', () => {
    beforeEach(() => {
      insertComic(db, { id: 'a', series: 'Closer to Danger', name: 'Closer 01.cbz', path: '/libs/A/a.cbz', guidedViewStatus: 'completed', metadata: '{"Number":"1","Year":"2024"}' });
      insertComic(db, { id: 'b', series: 'Berserk', name: 'Berserk v1.cbz', path: '/libs/A/b.cbz', guidedViewStatus: 'pending', metadata: '{"Number":"1"}' });
      insertComic(db, { id: 'c', series: 'Danger Mouse', name: 'DM 2.cbz', path: '/libs/B/c.cbz', guidedViewStatus: 'completed', metadata: '{"Number":"2"}' });
    });

    it('filters by query across series and name, case-insensitively', () => {
      const all = searchComics(db, {});
      expect(all.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);

      const danger = searchComics(db, { q: 'danger' });
      expect(danger.map((r) => r.id).sort()).toEqual(['a', 'c']);
      expect(danger[0].metadata).toBeDefined();
    });

    it('filters by guided view status and paginates', () => {
      const completed = searchComics(db, { status: 'completed' });
      expect(completed.map((r) => r.id).sort()).toEqual(['a', 'c']);

      // ORDER BY series, name -> [Berserk(b), Closer to Danger(a), Danger Mouse(c)]
      const page = searchComics(db, { limit: 1, offset: 1 });
      expect(page.length).toBe(1);
      expect(page[0].id).toBe('a');
    });

    it('escapes LIKE wildcards % and _ to match literal characters only', () => {
      insertComic(db, { id: 'd', series: '100% Danger', name: 'Issue 1.cbz', path: '/libs/A/d.cbz' });
      insertComic(db, { id: 'e', series: 'Special_Edition', name: 'Issue 2.cbz', path: '/libs/A/e.cbz' });

      const pct = searchComics(db, { q: '%' });
      expect(pct.map((r) => r.id)).toEqual(['d']);

      const underscore = searchComics(db, { q: '_' });
      expect(underscore.map((r) => r.id)).toEqual(['e']);
    });
  });

  describe('countComics', () => {
    beforeEach(() => {
      insertComic(db, { id: 'a', series: 'Closer to Danger', name: 'Closer 01.cbz', path: '/libs/A/a.cbz', guidedViewStatus: 'completed', metadata: '{}' });
      insertComic(db, { id: 'b', series: 'Berserk', name: 'Berserk v1.cbz', path: '/libs/A/b.cbz', guidedViewStatus: 'pending', metadata: '{}' });
      insertComic(db, { id: 'c', series: 'Danger Mouse', name: 'DM 2.cbz', path: '/libs/B/c.cbz', guidedViewStatus: 'completed', metadata: '{}' });
    });

    it('counts with the same filters as searchComics', () => {
      expect(countComics(db, {})).toBe(3);
      expect(countComics(db, { q: 'danger' })).toBe(2);
      expect(countComics(db, { status: 'completed' })).toBe(2);
      expect(countComics(db, { q: 'danger', status: 'completed' })).toBe(2);
      expect(countComics(db, { q: 'nomatch' })).toBe(0);
    });
  });

  describe('getComic', () => {
    it('returns the row with parsed metadata, or null', () => {
      insertComic(db, { id: 'a', series: 'S', metadata: '{"Year":"1999"}' });
      const row = getComic(db, 'a');
      expect(row.id).toBe('a');
      expect(row.metadata).toEqual({ Year: '1999' });
      expect(getComic(db, 'missing')).toBeNull();
    });
  });

  describe('resolveMangaMode', () => {
    const libraries = ['/libs/A'];

    it('walks comic -> series -> publisher -> library, first set value wins', () => {
      insertPref(db, { preferenceType: 'library', targetId: '/libs/A', mangaMode: 1 });
      insertPref(db, { preferenceType: 'series', targetId: 'Ser', mangaMode: 0 });
      insertPref(db, { preferenceType: 'publisher', targetId: 'Pub', mangaMode: 1 });

      const comic = { id: 'c1', series: 'Ser', publisher: 'Pub', path: '/libs/A/c1.cbz' };
      expect(resolveMangaMode(db, 'default-user', comic, libraries)).toBe(false);

      insertPref(db, { preferenceType: 'comic', targetId: 'c1', mangaMode: 1 });
      expect(resolveMangaMode(db, 'default-user', comic, libraries)).toBe(true);
    });

    it('skips null mangaMode rows and falls through to lower levels', () => {
      insertPref(db, { preferenceType: 'comic', targetId: 'c1', mangaMode: null });
      insertPref(db, { preferenceType: 'publisher', targetId: 'Pub', mangaMode: 1 });
      const comic = { id: 'c1', series: 'Ser', publisher: 'Pub', path: '/libs/A/c1.cbz' };
      expect(resolveMangaMode(db, 'default-user', comic, libraries)).toBe(true);
    });

    it('lets a user row override default-user, and null user rows fall back to default-user', () => {
      insertPref(db, { userId: 'default-user', preferenceType: 'series', targetId: 'Ser', mangaMode: 1 });
      insertPref(db, { userId: 'u1', preferenceType: 'series', targetId: 'Ser', mangaMode: 0 });
      const comic = { id: 'c1', series: 'Ser', publisher: 'Pub', path: '/libs/A/c1.cbz' };
      expect(resolveMangaMode(db, 'u1', comic, libraries)).toBe(false);

      db.prepare('UPDATE user_reading_preferences SET mangaMode = NULL WHERE userId = ?').run('u1');
      expect(resolveMangaMode(db, 'u1', comic, libraries)).toBe(true);
    });

    it('defaults to false when nothing is set', () => {
      const comic = { id: 'c9', series: 'S', publisher: 'P', path: '/other/x.cbz' };
      expect(resolveMangaMode(db, 'default-user', comic, libraries)).toBe(false);
    });

    it('does not match libraries when path has a common prefix without path separator', () => {
      insertPref(db, { preferenceType: 'library', targetId: '/libs/A', mangaMode: 1 });
      const comicInOther = { id: 'c2', series: 'Ser2', publisher: 'Pub', path: '/libs/A2/c2.cbz' };
      expect(resolveMangaMode(db, 'default-user', comicInOther, libraries)).toBe(false);

      const comicInLib = { id: 'c3', series: 'Ser3', publisher: 'Pub', path: '/libs/A/sub/c3.cbz' };
      expect(resolveMangaMode(db, 'default-user', comicInLib, libraries)).toBe(true);
    });
  });
});
