const fs = require('fs');
const path = require('path');
const { mimeFor, appendMissing, canonicalType, loadComic, pageDimensions, clearDimensionCache } = require('../../../src/server/routes/shared');
const { createTestDb, insertComic, insertPref } = require('../../helpers/test-db');
const archive = require('../../../src/server/archive');
const pageDims = require('../../../src/server/page-dims');

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      stat: jest.fn()
    }
  };
});
jest.mock('../../../src/server/archive');
jest.mock('../../../src/server/page-dims');

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

  describe('pageDimensions and clearDimensionCache', () => {
    beforeEach(() => {
      clearDimensionCache();
      jest.clearAllMocks();
    });

    it('returns an empty map if names is empty', async () => {
      const result = await pageDimensions('/fake/path.cbz', []);
      expect(result.size).toBe(0);
      expect(fs.promises.stat).not.toHaveBeenCalled();
    });

    it('processes images and uses mtime = 0 when fs.promises.stat fails', async () => {
      fs.promises.stat.mockRejectedValue(new Error('ENOENT'));
      archive.getEntryBuffer.mockResolvedValue(Buffer.from('fake-image'));
      pageDims.imageDimensions.mockReturnValue({ width: 100, height: 200 });

      const cbzPath = '/fake/path.cbz';
      const resolved = path.resolve(cbzPath);
      const names = ['01.jpg'];

      const result = await pageDimensions(cbzPath, names);

      expect(fs.promises.stat).toHaveBeenCalledWith(cbzPath);
      expect(result.get('01.jpg')).toEqual({ width: 100, height: 200 });
    });

    it('calls getEntryBuffer and imageDimensions, and caches the result', async () => {
      fs.promises.stat.mockResolvedValue({ mtimeMs: 12345 });
      archive.getEntryBuffer.mockResolvedValue(Buffer.from('fake-image-2'));
      pageDims.imageDimensions.mockReturnValue({ width: 300, height: 400 });

      const cbzPath = '/fake/path2.cbz';
      const resolved = path.resolve(cbzPath);
      const names = ['02.jpg'];

      const result1 = await pageDimensions(cbzPath, names);

      expect(fs.promises.stat).toHaveBeenCalledWith(cbzPath);
      expect(archive.getEntryBuffer).toHaveBeenCalledWith(cbzPath, '02.jpg');
      expect(pageDims.imageDimensions).toHaveBeenCalledWith(Buffer.from('fake-image-2'));
      expect(result1.get('02.jpg')).toEqual({ width: 300, height: 400 });

      // Second call should use cache
      archive.getEntryBuffer.mockClear();
      pageDims.imageDimensions.mockClear();

      const result2 = await pageDimensions(cbzPath, names);
      expect(result2.get('02.jpg')).toEqual({ width: 300, height: 400 });
      expect(archive.getEntryBuffer).not.toHaveBeenCalled();
      expect(pageDims.imageDimensions).not.toHaveBeenCalled();
    });

    it('gracefully handles failures in imageDimensions or getEntryBuffer by returning null', async () => {
      fs.promises.stat.mockResolvedValue({ mtimeMs: 12345 });
      archive.getEntryBuffer.mockRejectedValue(new Error('read error'));

      const cbzPath = '/fake/path3.cbz';
      const names = ['03.jpg'];

      const result = await pageDimensions(cbzPath, names);

      expect(result.get('03.jpg')).toBeNull();

      // Check cache has null
      archive.getEntryBuffer.mockClear();
      const result2 = await pageDimensions(cbzPath, names);
      expect(result2.get('03.jpg')).toBeNull();
      expect(archive.getEntryBuffer).not.toHaveBeenCalled();
    });

    it('clearDimensionCache empties the cache', async () => {
      fs.promises.stat.mockResolvedValue({ mtimeMs: 12345 });
      archive.getEntryBuffer.mockResolvedValue(Buffer.from('data'));
      pageDims.imageDimensions.mockReturnValue({ width: 10, height: 10 });

      const cbzPath = '/fake/path4.cbz';
      const names = ['04.jpg'];

      await pageDimensions(cbzPath, names);

      clearDimensionCache();

      archive.getEntryBuffer.mockClear();
      pageDims.imageDimensions.mockClear();

      await pageDimensions(cbzPath, names);

      expect(archive.getEntryBuffer).toHaveBeenCalledTimes(1);
      expect(pageDims.imageDimensions).toHaveBeenCalledTimes(1);
    });
  });
});