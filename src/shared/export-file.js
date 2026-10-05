'use strict';

const FORMAT_VERSION = 1;

function baseName(fileName) {
  return String(fileName || '').replace(/\.(cbz|cbr|pdf)$/i, '');
}

// Download name for an export: the comic's file name with a .json extension,
// with characters that are illegal in filenames replaced by '_'.
function exportFileName(fileName) {
  const base = baseName(fileName).replace(/[\\/:*?"<>|]/g, '_').trim();
  return base ? `${base}.json` : 'export.json';
}

function buildExportFile({ comic, type, pages, pageOrder, exportedAt, appVersion }) {
  const meta = parseMetadata(comic.metadata);
  return {
    formatVersion: FORMAT_VERSION,
    app: `gve-now/${appVersion || '0.0.0'}`,
    exportedAt: exportedAt || null,
    type,
    comic: {
      sourceComicId: comic.id,
      series: comic.series != null && comic.series !== '' ? comic.series : meta.Series || null,
      number: meta.Number || null,
      volume: meta.Volume || null,
      year: meta.Year || null,
      publisher: comic.publisher || meta.Publisher || null,
      title: meta.Title || null,
      fileName: comic.name || null,
      fileBaseName: baseName(comic.name),
      pageCount: Object.keys(pages).length
    },
    pageOrder: Array.isArray(pageOrder) ? pageOrder : Object.keys(pages),
    pages
  };
}

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function parseExportFile(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'export file must be a JSON object' };
  }
  if (input.formatVersion !== FORMAT_VERSION) {
    return { ok: false, error: `unsupported formatVersion: ${JSON.stringify(input.formatVersion)} (expected ${FORMAT_VERSION})` };
  }
  if (input.type !== 'western' && input.type !== 'manga') {
    return { ok: false, error: `invalid type: ${JSON.stringify(input.type)}` };
  }
  if (input.pages === null || typeof input.pages !== 'object' || Array.isArray(input.pages)) {
    return { ok: false, error: 'pages must be an object' };
  }
  const pages = input.pages;
  const pageOrder = Array.isArray(input.pageOrder) ? input.pageOrder : Object.keys(pages);
  return {
    ok: true,
    data: {
      formatVersion: input.formatVersion,
      app: input.app || null,
      exportedAt: input.exportedAt || null,
      type: input.type,
      comic: input.comic || {},
      pageOrder,
      pages
    }
  };
}

module.exports = { FORMAT_VERSION, buildExportFile, parseExportFile, exportFileName };
