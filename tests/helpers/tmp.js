'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpDir(prefix = 'gve-now-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

module.exports = { tmpDir, rmrf };
