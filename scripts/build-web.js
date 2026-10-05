#!/usr/bin/env node
'use strict';

// Bundle the browser frontend (src/web + shared) into public/app.js.

const path = require('path');
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: [path.join(__dirname, '..', 'src', 'web', 'main.js')],
  bundle: true,
  outfile: path.join(__dirname, '..', 'public', 'app.js'),
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true,
  logLevel: 'info'
};

if (watch) {
  esbuild.context(options).then((ctx) => ctx.watch()).catch(() => process.exit(1));
} else {
  esbuild.build(options).catch(() => process.exit(1));
}
