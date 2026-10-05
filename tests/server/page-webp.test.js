const fs = require('fs');
const path = require('path');
const { webpCacheKey, getPageImage } = require('../../src/server/page-webp');
const { tmpDir, rmrf } = require('../helpers/tmp');

describe('server/page-webp', () => {
  let dir;
  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => rmrf(dir));

  it("reproduces comics-now's full-res webp cache key", () => {
    // Golden vector computed with comics-now's own getPageCacheKey
    // (server/services/page-cache.js) for ('/x/y.cbz', 123, 'f/p.jpg', 'full'):
    // sha1('<resolved>:<mtimeMs>:<entry>:full') + '_wfull.webp'.
    expect(webpCacheKey('/x/y.cbz', 123, 'f/p.jpg'))
      .toBe('1ef718bd5d755a48e9fb5fe78cf09f377986fe52_wfull.webp');
  });

  // A stub transcoder: records argv, then writes the webp to the output path
  // (the last argument); (fail) writes a partial file and exits 1, (sleep)
  // stalls until killed. Refuses non-absolute output args — a pipe would mean
  // ffmpeg leaves the RIFF size field 0.
  function stubFfmpeg({ mode = 'ok' } = {}) {
    const counter = path.join(dir, 'ffmpeg-calls');
    const bin = path.join(dir, `ffmpeg-${mode}.js`);
    fs.writeFileSync(bin, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
fs.appendFileSync(${JSON.stringify(counter)}, JSON.stringify(process.argv.slice(2)) + '\\n');
const mode = ${JSON.stringify(mode)};
if (mode === 'sleep') {
  process.stdin.resume();
  setInterval(() => {}, 1000);
} else {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => {
    const out = process.argv[process.argv.length - 1];
    if (!path.isAbsolute(out)) process.exit(3);
    if (mode === 'fail') { fs.writeFileSync(out, 'PARTIAL'); process.exit(1); }
    fs.writeFileSync(out, Buffer.concat([Buffer.from('WEBP'), Buffer.from([chunks.length ? 1 : 0])]));
  });
}
`);
    fs.chmodSync(bin, 0o755);
    const calls = () =>
      fs.existsSync(counter)
        ? fs.readFileSync(counter, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
        : [];
    return { bin, calls: () => calls().length, args: calls };
  }

  function makeCbzFile(bytes = 'source-bytes') {
    const p = path.join(dir, 'book.cbz');
    fs.writeFileSync(p, bytes);
    return p;
  }

  it('serves a cached full-res webp without touching the archive', async () => {
    const cbz = makeCbzFile();
    const cacheDir = path.join(dir, 'page-cache');
    fs.mkdirSync(cacheDir);
    const key = webpCacheKey(cbz, fs.statSync(cbz).mtimeMs, 'p1.jpg');
    fs.writeFileSync(path.join(cacheDir, key), Buffer.from('CACHED-WEBP'));
    const readEntry = jest.fn();

    const got = await getPageImage({ cbzPath: cbz, entryName: 'p1.jpg', cacheDir, readEntry });
    expect(got).toMatchObject({ contentType: 'image/webp', source: 'webp-cache' });
    expect(got.buffer.toString()).toBe('CACHED-WEBP');
    expect(readEntry).not.toHaveBeenCalled();
  });

  it('transcodes a missing entry once, caches it, and serves it from cache thereafter', async () => {
    const cbz = makeCbzFile();
    const cacheDir = path.join(dir, 'page-cache');
    const ff = stubFfmpeg();
    const readEntry = jest.fn(async () => Buffer.from('SOURCE-JPEG'));

    const first = await getPageImage({ cbzPath: cbz, entryName: 'p1.jpg', cacheDir, readEntry, ffmpegBin: ff.bin });
    expect(first).toMatchObject({ contentType: 'image/webp', source: 'webp-new' });
    expect(first.buffer.slice(0, 4).toString()).toBe('WEBP');
    expect(ff.calls()).toBe(1);

    const key = webpCacheKey(cbz, fs.statSync(cbz).mtimeMs, 'p1.jpg');
    expect(fs.readFileSync(path.join(cacheDir, key)).equals(first.buffer)).toBe(true);

    const second = await getPageImage({ cbzPath: cbz, entryName: 'p1.jpg', cacheDir, readEntry, ffmpegBin: ff.bin });
    expect(second.source).toBe('webp-cache');
    expect(second.buffer.equals(first.buffer)).toBe(true);
    expect(ff.calls()).toBe(1);
    expect(readEntry).toHaveBeenCalledTimes(1);
  });

  it('writes ffmpeg output to a real temp file, not a pipe', async () => {
    // Piped output makes ffmpeg leave the RIFF size field 0 and append the real
    // size as a trailer; strict decoders (Firefox) reject that file with an
    // image decode error. Temp-file output is seekable, so ffmpeg writes a
    // correct header.
    const cbz = makeCbzFile();
    const ff = stubFfmpeg();

    const got = await getPageImage({
      cbzPath: cbz,
      entryName: 'p1.jpg',
      cacheDir: path.join(dir, 'page-cache'),
      readEntry: async () => Buffer.from('SRC'),
      ffmpegBin: ff.bin
    });
    expect(got.source).toBe('webp-new');

    const outArg = ff.args()[0].at(-1);
    expect(outArg).not.toBe('pipe:1');
    expect(path.isAbsolute(outArg)).toBe(true);
    expect(outArg.endsWith('.webp')).toBe(true);
    expect(fs.existsSync(outArg)).toBe(false); // temp file cleaned up after read
  });

  it('removes the temp file when ffmpeg fails', async () => {
    const cbz = makeCbzFile();
    const ff = stubFfmpeg({ mode: 'fail' });

    const got = await getPageImage({
      cbzPath: cbz,
      entryName: 'p1.jpg',
      cacheDir: path.join(dir, 'page-cache'),
      readEntry: async () => Buffer.from('SRC'),
      ffmpegBin: ff.bin
    });
    expect(got.source).toBe('original');
    expect(fs.existsSync(ff.args()[0].at(-1))).toBe(false);
  });

  it('falls back to the original bytes when transcoding fails', async () => {
    const cbz = makeCbzFile();
    const cacheDir = path.join(dir, 'page-cache');
    const ff = stubFfmpeg({ mode: 'fail' });

    const got = await getPageImage({
      cbzPath: cbz,
      entryName: 'p1.png',
      cacheDir,
      readEntry: async () => Buffer.from('SOURCE-PNG'),
      ffmpegBin: ff.bin
    });
    expect(got).toMatchObject({ contentType: null, source: 'original' });
    expect(got.buffer.toString()).toBe('SOURCE-PNG');
    expect(fs.existsSync(cacheDir)).toBe(false);
  });

  it('rejects the transcode instead of hanging when the transcoder stalls', async () => {
    const cbz = makeCbzFile();
    const ff = stubFfmpeg({ mode: 'sleep' });

    const got = await getPageImage({
      cbzPath: cbz,
      entryName: 'p1.jpg',
      cacheDir: path.join(dir, 'page-cache'),
      readEntry: async () => Buffer.from('SRC'),
      ffmpegBin: ff.bin,
      timeoutMs: 500
    });
    expect(got.source).toBe('original');
  }, 10000);

  it('never transcodes gifs (animation) — serves them as-is', async () => {
    const cbz = makeCbzFile();
    const ff = stubFfmpeg();

    const got = await getPageImage({
      cbzPath: cbz,
      entryName: 'anim.gif',
      cacheDir: path.join(dir, 'page-cache'),
      readEntry: async () => Buffer.from('GIF89a'),
      ffmpegBin: ff.bin
    });
    expect(got).toMatchObject({ contentType: null, source: 'original' });
    expect(ff.calls()).toBe(0);
  });

  it('serves transcoded bytes even when the cache write fails', async () => {
    const cbz = makeCbzFile();
    const cacheDirAsFile = path.join(dir, 'not-a-dir');
    fs.writeFileSync(cacheDirAsFile, 'x');
    const ff = stubFfmpeg();

    const got = await getPageImage({
      cbzPath: cbz,
      entryName: 'p1.jpg',
      cacheDir: cacheDirAsFile,
      readEntry: async () => Buffer.from('SRC'),
      ffmpegBin: ff.bin
    });
    expect(got.source).toBe('webp-new');
    expect(got.buffer.slice(0, 4).toString()).toBe('WEBP');
  });
});
