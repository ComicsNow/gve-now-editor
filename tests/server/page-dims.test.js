const { imageDimensions } = require('../../src/server/page-dims');

// Verified 1x1 fixtures (header offsets checked byte-for-byte).
const B64 = {
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  gif: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  jpeg: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  webp: 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'
};

const buf = (key) => Buffer.from(B64[key], 'base64');

describe('server/page-dims', () => {
  it('reads 1x1 dimensions from PNG, GIF, JPEG and WebP', () => {
    expect(imageDimensions(buf('png'))).toEqual({ width: 1, height: 1 });
    expect(imageDimensions(buf('gif'))).toEqual({ width: 1, height: 1 });
    expect(imageDimensions(buf('jpeg'))).toEqual({ width: 1, height: 1 });
    expect(imageDimensions(buf('webp'))).toEqual({ width: 1, height: 1 });
  });

  it('returns null for unknown or truncated data without throwing', () => {
    expect(imageDimensions(Buffer.from('not an image'))).toBeNull();
    expect(imageDimensions(Buffer.alloc(0))).toBeNull();
    expect(imageDimensions(buf('png').slice(0, 12))).toBeNull();
  });

  it('reads dimensions from JPEG with 0xff fill bytes and handles EOI marker', () => {
    // Valid JPEG with a 0xff fill byte before APP0, and SOF0
    const jpegWithFill = Buffer.from([
      0xff, 0xd8, // SOI
      0xff, 0xff, 0xe0, 0x00, 0x10, // 0xff fill byte followed by APP0 (size 16)
      0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x00, 0x02, 0x00, // SOF0: height 256, width 512
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01
    ]);
    expect(imageDimensions(jpegWithFill)).toEqual({ width: 512, height: 256 });
  });
});
