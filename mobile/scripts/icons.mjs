import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// The extension's hand-rolled PNG decoder and box-filter resizer, reused rather
// than reimplemented — and reused rather than replaced with an image
// dependency, which is the same call `extension/scripts/build.mjs` made.
import { decodePng, resize, encodePng } from '../../extension/scripts/resize.mjs';

/**
 * Generate the app icons from the web app's own icon.
 *
 * One source of truth for the mark: `static/web-app-manifest-512x512.png`. A
 * separate hand-made app icon is how a product ends up with two subtly
 * different logos, and the phone icon is the one people see most.
 *
 * Run when the source icon changes:
 *
 *   node mobile/scripts/icons.mjs
 *
 * The output is committed, because it is stable binary output and a build step
 * that rewrites binaries on every `npm ci` makes for noisy diffs.
 *
 * **iOS icons must not have an alpha channel.** The App Store rejects them, and
 * the simulator shows a black square rather than telling you why — so the
 * background is composited in here rather than left transparent.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../static/web-app-manifest-512x512.png');
const OUT = resolve(HERE, '../assets');

/** `--color-bg` in the light theme, so the icon sits on Heli's own paper. */
const BACKGROUND = [0xf6, 0xf8, 0xfc];

function flatten(rgba, background) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      out[i + c] = Math.round(out[i + c] * a + background[c] * (1 - a));
    }
    out[i + 3] = 255;
  }
  return out;
}

/** Shrink the mark and centre it, leaving breathing room around the edges. */
function inset(src, size, scale, background) {
  const inner = resize(src, Math.round(size * scale));
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = background[0];
    rgba[i + 1] = background[1];
    rgba[i + 2] = background[2];
    rgba[i + 3] = 255;
  }
  const offset = Math.round((size - inner.width) / 2);
  for (let y = 0; y < inner.height; y++) {
    for (let x = 0; x < inner.width; x++) {
      const from = (y * inner.width + x) * 4;
      const to = ((y + offset) * size + (x + offset)) * 4;
      const a = inner.rgba[from + 3] / 255;
      for (let c = 0; c < 3; c++) {
        rgba[to + c] = Math.round(inner.rgba[from + c] * a + background[c] * (1 - a));
      }
      rgba[to + 3] = 255;
    }
  }
  return { width: size, height: size, rgba };
}

/**
 * Encode without an alpha channel at all (PNG colour type 2).
 *
 * Setting every alpha byte to 255 is not enough: App Store validation rejects an
 * icon that merely *has* the channel, and the failure arrives at submission
 * rather than at build. `encodePng` from the extension always writes RGBA, so
 * the iOS icon gets its own encoder — 20 lines against a dependency, the same
 * call `resize.mjs` itself made.
 */
function encodeRgbPng({ width, height, rgba }) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = rowStart + 1 + x * 3;
      raw[to] = rgba[from];
      raw[to + 1] = rgba[from + 1];
      raw[to + 2] = rgba[from + 2];
    }
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour, no alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const source = decodePng(readFileSync(SRC));

const written = [];
function write(name, image) {
  writeFileSync(resolve(OUT, name), encodePng(image));
  written.push(`${name} ${image.width}×${image.height}`);
}

// iOS: 1024, no alpha channel at all, mark inset so it is not tight to the
// corners once iOS applies its own mask.
writeFileSync(resolve(OUT, 'icon.png'), encodeRgbPng(inset(source, 1024, 0.72, BACKGROUND)));
written.push('icon.png 1024×1024 (rgb, no alpha)');

// Android adaptive: the foreground is masked to a circle at ~66%, so the mark
// has to sit well inside the safe area or it gets clipped.
const fgSize = 1024;
const fg = resize(source, Math.round(fgSize * 0.45));
const foreground = { width: fgSize, height: fgSize, rgba: Buffer.alloc(fgSize * fgSize * 4) };
const off = Math.round((fgSize - fg.width) / 2);
for (let y = 0; y < fg.height; y++) {
  for (let x = 0; x < fg.width; x++) {
    const from = (y * fg.width + x) * 4;
    const to = ((y + off) * fgSize + (x + off)) * 4;
    foreground.rgba.set(fg.rgba.subarray(from, from + 4), to);
  }
}
write('android-icon-foreground.png', foreground);

// The splash mark keeps its transparency: it is drawn on a themed background
// by Expo rather than composited here.
write('splash-icon.png', { ...resize(source, 512) });
write('favicon.png', { ...flattenImage(resize(source, 96)) });

function flattenImage(img) {
  return { ...img, rgba: flatten(img.rgba, BACKGROUND) };
}

console.log(`icons: generated from static/web-app-manifest-512x512.png\n  ${written.join('\n  ')}`);
