'use strict';

// Minimal header-dimension reader for JPEG/PNG/GIF/WebP — no image-decoding dependency.

function imageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return null;

  // PNG: IHDR is the first chunk.
  if (buffer.readUInt32BE(0) === 0x89504e47) {
    if (buffer.length < 24) return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // GIF: logical screen descriptor.
  if (buffer.slice(0, 3).toString('ascii') === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }

  // JPEG: walk segments to the first SOF marker.
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buffer.length) {
      if (buffer[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buffer[i + 1];
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        i += 2;
        continue;
      }
      if (marker === 0xda) break; // start of scan: no SOF found
      const size = buffer.readUInt16BE(i + 2);
      const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        return { width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5) };
      }
      i += 2 + size;
    }
    return null;
  }

  // WebP: RIFF container; VP8 (lossy), VP8L (lossless), VP8X (extended).
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    const tag = buffer.slice(12, 16).toString('ascii');
    if (tag === 'VP8 ') {
      if (buffer.length < 30) return null;
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (tag === 'VP8L') {
      if (buffer.length < 25) return null;
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (tag === 'VP8X') {
      if (buffer.length < 30) return null;
      return {
        width: 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)),
        height: 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16))
      };
    }
    return null;
  }

  return null;
}

module.exports = { imageDimensions };
