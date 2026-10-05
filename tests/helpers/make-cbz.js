'use strict';

const fs = require('fs');
const archiver = require('archiver');

// Build a .cbz at filePath from [[entryName, content], ...]; resolves with filePath.
function makeCbz(filePath, entries) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filePath);
    const zip = archiver('zip');
    out.on('close', () => resolve(filePath));
    zip.on('error', reject);
    out.on('error', reject);
    zip.pipe(out);
    for (const [name, content] of entries) {
      zip.append(Buffer.isBuffer(content) ? content : Buffer.from(String(content)), { name });
    }
    zip.finalize();
  });
}

module.exports = { makeCbz };
