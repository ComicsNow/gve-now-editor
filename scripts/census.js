#!/usr/bin/env node
'use strict';

// Read-only census over a comics-now guided-view directory.
//
// Proves the save path is byte-lossless for untouched files: for every real
// sidecar, normalizing it (as the editor GET does), then merging the untouched
// document back (as the editor PUT does), reproduces the original file
// exactly — raw arrays, spread objects and key order included.
//
// It also reports, informationally, how many pages a *full* canonical
// regeneration would change. Those pages are exactly what the save-path merge
// protects: reader-visible array orders that must never drift on untouched
// pages (interleaved western sequences, detection-order bubble arrays, legacy
// raw-mixed manga panels, the spread-object sequence form).
//
// Usage: node scripts/census.js [guidedViewDir]

const fs = require('fs');
const path = require('path');
const { normalizeSidecar, regenerateSidecar, mergeSidecar, normalizeBox } = require('../src/shared/sidecar');
const { boxKey } = require('../src/shared/box');

const dir = process.argv[2] || '/opt/comics-now/metadata/guided_view';

const norm = (list) => (Array.isArray(list) ? list : []).map(normalizeBox).filter(Boolean).map(boxKey);

function channelDiff(originalPage, regeneratedPage) {
  const channels = [];
  for (const key of ['panels', 'bubbles', 'sequence']) {
    const before = JSON.stringify(norm(originalPage && originalPage[key]));
    const after = JSON.stringify(norm(regeneratedPage && regeneratedPage[key]));
    if (before !== after) channels.push(key[0].toUpperCase()); // P | B | S
  }
  return channels;
}

function main() {
  if (!fs.existsSync(dir)) {
    console.error(`guided view directory not found: ${dir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.'));
  const summary = {
    dir,
    sidecars: 0,
    pages: 0,
    byType: { western: 0, manga: 0 },
    spreadObjectBoxes: 0,
    bareArrayPages: 0,
    warnings: 0,
    // Informational: pages a full canonical regeneration would change.
    regenDrift: { pages: 0, byClass: {} },
    mergeFailures: [],
    errors: []
  };

  for (const file of files) {
    const full = path.join(dir, file);
    let original;
    try {
      original = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (err) {
      summary.errors.push(`${file}: ${err.message}`);
      continue;
    }
    summary.sidecars++;
    const type = original.type === 'manga' ? 'manga' : 'western';
    summary.byType[type]++;

    let normalized;
    let regenerated;
    let merged;
    try {
      normalized = normalizeSidecar(original);
      summary.warnings += normalized.warnings.length;
      regenerated = regenerateSidecar(normalized);
      merged = mergeSidecar(normalized, original);
    } catch (err) {
      summary.errors.push(`${file}: round trip threw: ${err.message}`);
      continue;
    }

    // The gate: an untouched GET -> PUT round trip is byte-identical.
    if (JSON.stringify(merged) !== JSON.stringify(original)) {
      summary.mergeFailures.push(file);
    }

    for (const [name, page] of Object.entries(original.pages || {})) {
      summary.pages++;
      if (Array.isArray(page)) summary.bareArrayPages++;
      for (const key of ['panels', 'bubbles', 'sequence']) {
        for (const box of (page && page[key]) || []) {
          if (!Array.isArray(box)) summary.spreadObjectBoxes++;
        }
      }
      const channels = channelDiff(page, (regenerated.pages || {})[name] || {});
      if (channels.length > 0) {
        summary.regenDrift.pages++;
        const cls = `${type}:${channels.join('')}`;
        summary.regenDrift.byClass[cls] = (summary.regenDrift.byClass[cls] || 0) + 1;
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length || summary.mergeFailures.length) {
    console.error(`\nFAIL: ${summary.mergeFailures.length} merge-lossless failure(s), ${summary.errors.length} error(s)`);
    process.exit(1);
  }
  console.log('\nOK: untouched GET -> PUT is byte-lossless on every sidecar');
}

main();
