const crypto = require('crypto');
const path = require('path');
const { listPages, getEntryBuffer } = require('../../src/server/archive');
const { makeCbz } = require('../helpers/make-cbz');
const { tmpDir, rmrf } = require('../helpers/tmp');

describe('server/archive', () => {
  let dir;
  let cbzPath;

  beforeAll(async () => {
    dir = tmpDir();
    cbzPath = path.join(dir, 'test.cbz');
    await makeCbz(cbzPath, [
      ['p10.jpg', 'ten'],
      ['p2.jpg', 'two'],
      ['p1.jpg', 'one'],
      ['p1.png', 'png-one'],
      ['readme.txt', 'not an image'],
      ['.hidden.jpg', 'dotfile'],
      ['__MACOSX/x.jpg', 'macosx'],
      ['dir/p3.jpeg', 'nested'],
      ['dir/.dot.jpg', 'nested dotfile']
    ]);
  });
  afterAll(() => rmrf(dir));

  it('lists image entries with dotfiles and __MACOSX filtered, sorted numeric-aware', async () => {
    expect(await listPages(cbzPath)).toEqual(['dir/p3.jpeg', 'p1.jpg', 'p1.png', 'p2.jpg', 'p10.jpg']);
  });

  it('returns entry buffers byte-identical to what was appended', async () => {
    expect((await getEntryBuffer(cbzPath, 'p2.jpg')).toString()).toBe('two');
    expect((await getEntryBuffer(cbzPath, 'dir/p3.jpeg')).toString()).toBe('nested');
  });

  it('rejects for a missing entry', async () => {
    await expect(getEntryBuffer(cbzPath, 'nope.jpg')).rejects.toThrow(/not found|missing/i);
  });

  it('rejects unsafe entry names (path traversal) without touching outside the archive', async () => {
    await expect(getEntryBuffer(cbzPath, '../../etc/passwd')).rejects.toThrow(/unsafe|traversal|not found/i);
    await expect(getEntryBuffer(cbzPath, '/etc/passwd')).rejects.toThrow(/unsafe|traversal|not found/i);
  });

  describe('large deflated entries', () => {
    // yauzl 2.10's openReadStream stalls (emits nothing, never settles) on entries
    // whose compressed size is large and incompressible — exactly the shape of
    // scan pages (randomBytes gives csize ~= usize, like a 1.9 MB page). Small or
    // well-compressing entries read fine, which is why fixtures never caught it.
    // The reader must therefore read via the `unzip` CLI, like comics-now's
    // archive-utils.js, and only fall back to yauzl.
    let bigCbz;
    let bigBytes;

    beforeAll(async () => {
      bigCbz = path.join(dir, 'big.cbz');
      bigBytes = crypto.randomBytes(2 * 1024 * 1024);
      await makeCbz(bigCbz, [['big.jpg', bigBytes], ['small.jpg', 'tiny']]);
    });

    it('reads a 2 MB incompressible entry byte-identically', async () => {
      const got = await getEntryBuffer(bigCbz, 'big.jpg');
      expect(got.length).toBe(bigBytes.length);
      expect(got.equals(bigBytes)).toBe(true);
    });

    it('escapes unzip glob metacharacters in entry names', async () => {
      const weird = path.join(dir, 'weird.cbz');
      await makeCbz(weird, [['ba[t]?*.jpg', 'weird-bytes'], ['bat1.jpg', 'other-bytes']]);
      expect((await getEntryBuffer(weird, 'ba[t]?*.jpg')).toString()).toBe('weird-bytes');
    });

    it('falls back to yauzl when unzip is unavailable', async () => {
      // A nonexistent binary name is the hermetic way to disable the unzip
      // path; PATH tricks don't hold inside the jest worker process.
      const opts = { unzipBin: 'gve-now-test-missing-unzip' };
      expect((await getEntryBuffer(cbzPath, 'p2.jpg', opts)).toString()).toBe('two');
    });

    it('rejects instead of hanging when both readers stall', async () => {
      // unzip is missing (immediate failure) and the yauzl deadline is 0ms, so a
      // 2 MB read cannot beat the timer on any machine — a deterministic stand-in
      // for yauzl's real stall-forever behaviour on large incompressible entries,
      // which only reproduces on some Node/zlib builds (not the CI runner).
      await expect(
        getEntryBuffer(bigCbz, 'big.jpg', { unzipBin: 'gve-now-test-missing-unzip', yauzlTimeoutMs: 0 })
      ).rejects.toThrow(/timed out|timeout/i);
    });
  });
});
