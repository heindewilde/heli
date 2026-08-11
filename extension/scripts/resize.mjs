import { deflateSync, inflateSync } from 'node:zlib';

/**
 * A minimal PNG decoder and box-filter resampler.
 *
 * Chrome draws the toolbar action at 16 px (32 at 2× DPI) and the Web Store
 * requires a 128 in the manifest. `static/` has 96, 180, 192 and 512 — so
 * without this every small rendering is a 6× downscale of a 96 px image, which
 * is exactly the blur the size mapping exists to avoid, and there is no 128 to
 * declare at all.
 *
 * Node has zlib built in and PNG is a simple container, so generating the
 * missing sizes is ~100 lines rather than an image dependency. Handles the
 * 8-bit RGBA non-interlaced case, which is what the source icons are; anything
 * else throws rather than producing a quietly wrong image.
 */

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunks(png) {
  const out = [];
  let at = 8;
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    out.push({ type, data: png.subarray(at + 8, at + 8 + len) });
    at += 12 + len;
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode to { width, height, rgba } with 4 bytes per pixel. */
export function decodePng(png) {
  if (!png.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  const parts = chunks(png);
  const ihdr = parts.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('no IHDR');

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const depth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];
  if (depth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported PNG (depth ${depth}, colour ${colorType}, interlace ${interlace})`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(
    Buffer.concat(parts.filter((c) => c.type === 'IDAT').map((c) => c.data))
  );

  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  let at = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[at++];
    const line = Buffer.from(raw.subarray(at, at + stride));
    at += stride;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 0xff;
      else if (filter === 2) line[i] = (line[i] + b) & 0xff;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) line[i] = (line[i] + paeth(a, b, c)) & 0xff;
      else if (filter !== 0) throw new Error(`unknown filter ${filter}`);
    }

    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      rgba[d] = line[s];
      rgba[d + 1] = line[s + 1];
      rgba[d + 2] = line[s + 2];
      rgba[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }

  return { width, height, rgba };
}

/**
 * Box-filter downscale. Averaging every source pixel that falls inside a
 * destination pixel — the right choice for large reductions, where nearest
 * neighbour drops most of the image and produces the ragged edges that make a
 * scaled-down icon look broken.
 */
export function resize(src, size) {
  const { width, height, rgba } = src;
  const out = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    const y0 = Math.floor((y * height) / size);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / size));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor((x * width) / size);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / size));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * width + sx) * 4;
          const alpha = rgba[i + 3];
          // Premultiply, or transparent pixels drag their colour into the
          // average and edges pick up a halo.
          r += rgba[i] * alpha;
          g += rgba[i + 1] * alpha;
          b += rgba[i + 2] * alpha;
          a += alpha;
          n++;
        }
      }
      const d = (y * size + x) * 4;
      if (a === 0) {
        out[d] = out[d + 1] = out[d + 2] = out[d + 3] = 0;
      } else {
        out[d] = Math.round(r / a);
        out[d + 1] = Math.round(g / a);
        out[d + 2] = Math.round(b / a);
        out[d + 3] = Math.round(a / n);
      }
    }
  }
  return { width: size, height: size, rgba: out };
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng({ width, height, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // 10, 11, 12 = compression, filter, interlace — all zero.

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
