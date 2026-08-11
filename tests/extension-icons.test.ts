import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

/**
 * The extension's icon pipeline, tested from the app's suite because the
 * extension has no runner of its own.
 *
 * This is a hand-written PNG decoder and resampler, so the failure mode is a
 * plausible-looking image that is subtly wrong — a halo, a colour shift, a
 * silently truncated buffer. Round-tripping and checking the invariants a box
 * filter must preserve catches that; eyeballing a 16 px icon does not.
 */

// @ts-expect-error — plain JS build script, no type declarations.
const { decodePng, encodePng, resize } = await import('../extension/scripts/resize.mjs');

type Image = { width: number; height: number; rgba: Buffer };

const SOURCE = 'static/web-app-manifest-512x512.png';

function meanColour(img: Image) {
  let r = 0, g = 0, b = 0, a = 0;
  for (let i = 0; i < img.rgba.length; i += 4) {
    r += img.rgba[i];
    g += img.rgba[i + 1];
    b += img.rgba[i + 2];
    a += img.rgba[i + 3];
  }
  const n = img.rgba.length / 4;
  return { r: r / n, g: g / n, b: b / n, a: a / n };
}

describe('decode', () => {
  test('reads the app icon at its real dimensions', () => {
    const img: Image = decodePng(readFileSync(SOURCE));
    expect(img.width).toBe(512);
    expect(img.height).toBe(512);
    expect(img.rgba.length).toBe(512 * 512 * 4);
  });

  test('rejects a non-PNG rather than emitting noise', () => {
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow(/not a PNG/);
  });
});

describe('encode', () => {
  test('round-trips pixel-for-pixel', () => {
    const original: Image = decodePng(readFileSync(SOURCE));
    const again: Image = decodePng(encodePng(original));
    expect(again.width).toBe(original.width);
    expect(again.height).toBe(original.height);
    // Exact equality: the encoder writes filter-type 0 and deflate is lossless,
    // so anything less than identical means the decoder's un-filtering is wrong.
    expect(Buffer.compare(again.rgba, original.rgba)).toBe(0);
  });

  test('produces a real PNG signature and IHDR', () => {
    const png = encodePng({
      width: 2,
      height: 2,
      rgba: Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0])
    });
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.toString('ascii', 12, 16)).toBe('IHDR');
  });
});

describe('resize', () => {
  const source: Image = decodePng(readFileSync(SOURCE));

  test.each([16, 32, 48, 128])('produces an exact %ix%i square', (size) => {
    const out: Image = resize(source, size);
    expect(out.width).toBe(size);
    expect(out.height).toBe(size);
    expect(out.rgba.length).toBe(size * size * 4);
  });

  test('preserves mean colour — the invariant of an area average', () => {
    // A box filter averages every source pixel into exactly one destination
    // pixel, so the mean of the whole image cannot move. A nearest-neighbour
    // implementation, or one with an off-by-one in the source window, drifts.
    const before = meanColour(source);
    for (const size of [128, 48, 16]) {
      const after = meanColour(resize(source, size));
      expect(Math.abs(after.r - before.r)).toBeLessThan(2);
      expect(Math.abs(after.g - before.g)).toBeLessThan(2);
      expect(Math.abs(after.b - before.b)).toBeLessThan(2);
      expect(Math.abs(after.a - before.a)).toBeLessThan(2);
    }
  });

  test('does not blend transparent pixels into opaque neighbours', () => {
    // Half opaque red, half fully transparent *black*. Naive averaging without
    // premultiplying drags that black in and the result goes dark — the halo
    // that makes downscaled icons look dirty at the edges.
    const w = 4;
    const rgba = Buffer.alloc(w * w * 4);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (x < 2) {
          rgba[i] = 255;
          rgba[i + 3] = 255;
        } // else: left as 0,0,0,0
      }
    }
    const out: Image = resize({ width: w, height: w, rgba }, 2);
    // The left destination pixel came only from opaque red.
    expect(out.rgba[0]).toBe(255);
    expect(out.rgba[1]).toBe(0);
    expect(out.rgba[2]).toBe(0);
    // The right one came only from transparent source, so it stays transparent
    // rather than becoming a half-dark smear.
    expect(out.rgba[7]).toBe(0);
  });

  test('every size the manifest declares is generated from a real source', () => {
    const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
    const declared = new Set([
      ...Object.keys(manifest.icons),
      ...Object.keys(manifest.action.default_icon)
    ]);
    // Chrome renders the action at 16 (32 at 2x) and the store requires 128.
    for (const needed of ['16', '32', '48', '128']) {
      expect(declared).toContain(needed);
    }
    for (const size of declared) {
      expect(resize(source, Number(size)).width).toBe(Number(size));
    }
  });
});
