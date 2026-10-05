'use strict';

const express = require('express');
const { buildExportFile, exportFileName } = require('../../shared/export-file');
const { loadComic, appendMissing, listPages } = require('./shared');

// RFC 5987: an ASCII fallback in `filename` plus a percent-encoded `filename*`
// for non-ASCII names — Node rejects non-latin1 header values outright.
function contentDisposition(filename) {
  const needsEncoding = /[^\x20-\x7e]/.test(filename);
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const quoted = `attachment; filename="${ascii}"`;
  return needsEncoding ? `${quoted}; filename*=UTF-8''${encodeURIComponent(filename)}` : quoted;
}

function createExportRouter({ config, db, store, appVersion }) {
  const router = express.Router();

  router.get('/:id/export', async (req, res, next) => {
    try {
      const found = loadComic(db, config, req.params.id);
      if (!found) return res.status(404).json({ error: `comic not found: ${req.params.id}` });

      const sidecar = store.read(req.params.id);
      if (!sidecar) return res.status(404).json({ error: 'comic has no guided view sidecar to export' });

      const pageOrder = appendMissing(await listPages(found.comic.path), Object.keys(sidecar.pages || {}));
      const file = buildExportFile({
        comic: found.comic,
        type: sidecar.type === 'manga' ? 'manga' : 'western',
        pages: sidecar.pages || {},
        pageOrder,
        exportedAt: new Date().toISOString(),
        appVersion
      });

      res.set('Content-Disposition', contentDisposition(exportFileName(found.comic.name)));
      res.json(file);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createExportRouter };
