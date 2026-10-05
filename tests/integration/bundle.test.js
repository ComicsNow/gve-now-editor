'use strict';

const path = require('path');
const esbuild = require('esbuild');

// The browser bundle must never pull in server-only code (node builtins).
describe('web bundle', () => {
  let text;

  beforeAll(async () => {
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, '..', '..', 'src', 'web', 'main.js')],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: ['es2020'],
      logLevel: 'silent'
    });
    text = result.outputFiles[0].text;
  });

  it('builds into a non-trivial bundle', () => {
    expect(text.length).toBeGreaterThan(5000);
  });

  it('contains no node builtin requires', () => {
    expect(text).not.toMatch(/require\(["'](fs|path|http|https|child_process|os|net|tls)["']\)/);
    expect(text).not.toMatch(/from\s*["'](fs|path|http|https|child_process|os|net|tls)["']/);
  });
});
