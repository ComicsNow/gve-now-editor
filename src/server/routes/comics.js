'use strict';

const fs = require('fs');
const express = require('express');
const { searchComics, countComics, makeMangaModeResolver } = require('../comics-repo');
const { listPages, getEntryBuffer } = require('../archive');
const { imageDimensions } = require('../page-dims');
const { getPageImage } = require('../page-webp');
const { mimeFor, loadComic, appendMissing } = require('./shared');

const PAGE_SIZE_MAX = 100;

// limit/offset come straight from the query string; reject garbage instead of
// letting NaN reach SQLite (a 500) or a negative limit silently mean unlimited.
function parsePagination(query) {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_SIZE_MAX) return null;
  if (!Number.isInteger(offset) || offset < 0) return null;
  return { limit, offset };
}

function createComicsRouter({ config, db, store }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { q = '', status = '' } = req.query;
    const paging = parsePagination(req.query);
    if (!paging) {
      return res.status(400).json({
        error: `limit must be an integer between 1 and ${PAGE_SIZE_MAX}, offset an integer >= 0`
      });
    }
    const comics = searchComics(db, { q, status, ...paging });
    const total = countComics(db, { q, status });
    const resolveManga = makeMangaModeResolver(db, config.prefsUserId, config.libraries);
    res.json({
      comics: comics.map((comic) => ({ ...comic, mangaMode: resolveManga(comic) })),
      total,
      limit: paging.limit,
      offset: paging.offset
    });
  });

  router.get('/:id', (req, res) => {
    const found = loadComic(db, config, req.params.id);
    if (!found) return res.status(404).json({ error: `comic not found: ${req.params.id}` });
    res.json({ comic: found.comic, mangaMode: found.mangaMode });
  });

  router.get('/:id/pages', async (req, res, next) => {
    try {
      const found = loadComic(db, config, req.params.id);
      if (!found) return res.status(404).json({ error: `comic not found: ${req.params.id}` });

      const names = appendMissing(await listPages(found.comic.path), Object.keys(store.read(req.params.id)?.pages || {}));
      const pages = [];
      for (let i = 0; i < names.length; i++) {
        let dims = null;
        try {
          dims = imageDimensions(await getEntryBuffer(found.comic.path, names[i]));
        } catch {}
        pages.push({ index: i, name: names[i], width: dims ? dims.width : null, height: dims ? dims.height : null });
      }

      const sidecar = store.read(req.params.id);
      res.json({
        comicId: found.comic.id,
        pages,
        sidecarType: sidecar && sidecar.type ? sidecar.type : found.mangaMode ? 'manga' : 'western',
        hasSidecar: Boolean(sidecar)
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/page-image', async (req, res, next) => {
    try {
      const found = loadComic(db, config, req.params.id);
      if (!found) return res.status(404).json({ error: `comic not found: ${req.params.id}` });
      const page = String(req.query.page || '');
      if (!page) return res.status(400).json({ error: 'page query parameter is required' });

      // Full-res webp when available (shared with comics-now's reader cache),
      // original archive bytes otherwise — same pixel dimensions either way.
      let image;
      try {
        image = await getPageImage({
          cbzPath: found.comic.path,
          entryName: page,
          cacheDir: config.pageCacheDir,
          ffmpegBin: config.ffmpegBin,
          readEntry: getEntryBuffer
        });
      } catch {
        return res.status(404).json({ error: `page not found in archive: ${page}` });
      }

      const etag = `"${image.buffer.length}-${Math.round(fs.statSync(found.comic.path).mtimeMs)}"`;
      if (req.headers['if-none-match'] === etag) return res.status(304).end();

      res.set('Content-Type', image.contentType || mimeFor(page));
      res.set('ETag', etag);
      res.set('Cache-Control', 'private, max-age=300');
      res.send(image.buffer);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createComicsRouter };
