'use strict';

const fs = require('fs');
const express = require('express');
const { normalizeSidecar, mergeSidecar, validateEditorDocument } = require('../../shared/sidecar');
const { markGuidedViewComplete, markGuidedViewPending } = require('../db');
const { loadComic, canonicalType, pageDimensions, appendMissing, listPages } = require('./shared');

function createGuidedRouter({ config, db, store }) {
  const router = express.Router();

  router.get('/:id/guided', async (req, res, next) => {
    try {
      const found = loadComic(db, config, req.params.id);
      if (!found) return res.status(404).json({ error: `comic not found: ${req.params.id}` });

      const sidecar = store.read(req.params.id);
      const type = sidecar && (sidecar.type === 'manga' || sidecar.type === 'western')
        ? sidecar.type
        : found.mangaMode ? 'manga' : 'western';

      const pages = {};
      let warnings = [];
      if (sidecar) {
        const normalized = normalizeSidecar(sidecar);
        warnings = normalized.warnings;
        Object.assign(pages, normalized.pages);
      }

      const names = appendMissing(await listPages(found.comic.path), Object.keys(pages));
      const dims = await pageDimensions(found.comic.path, names);
      for (const name of names) {
        if (!pages[name]) pages[name] = { width: null, height: null, items: [], order: [] };
        const d = dims.get(name);
        if (d) {
          pages[name].width = d.width;
          pages[name].height = d.height;
        }
      }

      res.json({ comicId: found.comic.id, type, pages, warnings });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id/guided', async (req, res, next) => {
    try {
      const found = loadComic(db, config, req.params.id);
      if (!found) return res.status(404).json({ error: `comic not found: ${req.params.id}` });

      const doc = req.body;
      const { errors, warnings: boundsWarnings } = validateEditorDocument(doc);
      if (errors.length > 0) return res.status(400).json({ errors, warnings: boundsWarnings });

      const type = canonicalType(store, found.comic.id, found.mangaMode);
      const warnings = [...boundsWarnings];
      if (doc.type !== type) {
        warnings.push(`document type "${doc.type}" does not match the comic's guided view type "${type}"; saved as "${type}"`);
      }

      // Unedited pages are kept verbatim from the existing sidecar; only pages the
      // user actually changed are regenerated (never silently reorder reader data).
      // An unreadable existing file degrades to a full regeneration.
      let existing = null;
      try {
        existing = store.read(found.comic.id);
      } catch {
        existing = null;
      }
      const sidecarDoc = mergeSidecar({ comicId: found.comic.id, type, pages: doc.pages }, existing);
      const backupPath = store.backup(found.comic.id);
      store.write(found.comic.id, sidecarDoc);
      store.pruneBackups(found.comic.id);
      await markGuidedViewComplete(db, found.comic.id, store.pathFor(found.comic.id));

      res.json({ ok: true, warnings, backupPath, sidecarPath: store.pathFor(found.comic.id) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/guided/reset', async (req, res, next) => {
    try {
      const found = loadComic(db, config, req.params.id);
      if (!found) return res.status(404).json({ error: `comic not found: ${req.params.id}` });

      const backupPath = store.backup(found.comic.id);
      const file = store.pathFor(found.comic.id);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      await markGuidedViewPending(db, found.comic.id);

      res.json({ ok: true, backupPath });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createGuidedRouter };
