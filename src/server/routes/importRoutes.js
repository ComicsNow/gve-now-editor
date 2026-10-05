'use strict';

const express = require('express');
const { parseExportFile } = require('../../shared/export-file');
const { normalizeSidecar, normalizeSidecarPage, regenerateSidecar, mergeSidecar } = require('../../shared/sidecar');
const { scoreCandidate, rankCandidates } = require('../match');
const { mapPages } = require('../page-map');
const { markGuidedViewComplete } = require('../db');
const { searchComics, makeMangaModeResolver } = require('../comics-repo');
const { loadComic, canonicalType, pageDimensions, listPages } = require('./shared');

function createImportRouter({ config, db, store }) {
  const router = express.Router();

  const readFile = (body) => parseExportFile(body && body.file);

  router.post('/score', (req, res) => {
    const parsed = readFile(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const candidates = searchComics(db, { limit: 100000 });
    const resolveManga = makeMangaModeResolver(db, config.prefsUserId, config.libraries);
    const ranked = rankCandidates(
      parsed.data.comic,
      candidates.map((comic) => ({ ...comic, mangaMode: resolveManga(comic) }))
    );

    res.json({
      type: parsed.data.type,
      comic: parsed.data.comic,
      candidates: ranked.map((entry) => ({
        comic: entry.comic,
        score: entry.score,
        sourceComicIdMatch: entry.sourceComicIdMatch,
        breakdown: entry.breakdown
      }))
    });
  });

  router.post('/score-against', (req, res) => {
    const parsed = readFile(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const found = loadComic(db, config, req.body.comicId);
    if (!found) return res.status(404).json({ error: `comic not found: ${req.body.comicId}` });

    const result = scoreCandidate(parsed.data.comic, { ...found.comic, mangaMode: found.mangaMode });
    res.json({
      score: result.score,
      sourceComicIdMatch: result.sourceComicIdMatch,
      breakdown: result.breakdown,
      mangaMode: found.mangaMode
    });
  });

  router.post('/apply', async (req, res, next) => {
    try {
      const parsed = readFile(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });

      const { comicId, mode } = req.body || {};
      if (mode !== 'attach' && mode !== 'replace') return res.status(400).json({ error: 'mode must be "attach" or "replace"' });

      const found = loadComic(db, config, comicId);
      if (!found) return res.status(404).json({ error: `comic not found: ${comicId}` });

      const sidecar = store.read(comicId);
      const type = canonicalType(store, comicId, found.mangaMode);

      const names = await listPages(found.comic.path);
      const dims = await pageDimensions(found.comic.path, names);
      const targetDims = {};
      for (const [name, d] of dims) if (d) targetDims[name] = d;

      const mapped = mapPages({
        pages: parsed.data.pages,
        pageOrder: parsed.data.pageOrder,
        targetPages: names,
        targetDims
      });

      const docPages = {};
      if (mode === 'attach' && sidecar) {
        Object.assign(docPages, normalizeSidecar(sidecar).pages);
      } else if (mode === 'replace') {
        for (const name of names) docPages[name] = { width: null, height: null, items: [], order: [] };
      }
      for (const [name, page] of Object.entries(mapped.pages)) {
        if (!page) continue;
        const { items, order } = normalizeSidecarPage(
          { panels: page.panels, bubbles: page.bubbles, sequence: page.sequence, panelPoints: page.panelPoints, bubblePoints: page.bubblePoints },
          type
        );
        docPages[name] = { width: page.width, height: page.height, items, order };
      }

      // Attach edits the existing file: pages the import does not cover are kept
      // verbatim (never silently reorder reader data). Replace is a full rewrite.
      const doc = { comicId, type, pages: docPages };
      const sidecarDoc = mode === 'attach' ? mergeSidecar(doc, sidecar) : regenerateSidecar(doc);
      const backupPath = store.backup(comicId);
      store.write(comicId, sidecarDoc);
      store.pruneBackups(comicId);
      await markGuidedViewComplete(db, comicId, store.pathFor(comicId));

      res.json({ ok: true, summary: mapped.summary, warnings: [], backupPath, sidecarPath: store.pathFor(comicId) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createImportRouter };
