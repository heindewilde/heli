import { describe, expect, test } from 'vitest';
import { encodeQr, __test } from '../src/lib/server/qr';

/**
 * The QR encoder is hand-rolled, and its failure mode is unusually nasty: every
 * bug found while writing it produced a matrix that looks exactly like a QR code
 * — right size, three finders, plausible noise — and that no scanner will read.
 * There is nothing to notice by eye, and the only feedback in production is a
 * user saying "it doesn't work".
 *
 * Two of those bugs are pinned below by name, because both were subtle enough to
 * write twice:
 *
 *  1. The finder's white separator was painted dark wherever it crossed the
 *     `c === 0 || c === 6` edge test. Finders are located *by* their separator,
 *     so this alone made every code unreadable.
 *  2. The 15-bit format string was written least-significant bit first. The code
 *     then advertises the bit-reverse of the mask actually applied, so a decoder
 *     unmasks with the wrong pattern and finds noise.
 *
 * The fixture is a full matrix that was verified to decode by a real scanner
 * (jsQR) at the time it was captured. That is the check that would have caught
 * both bugs, and it needs no dependency to keep enforcing.
 */

const V3_PAIRING_URL = [
  '11111110010111010101001111111',
  '10000010010001111000101000001',
  '10111010100011000001001011101',
  '10111010110010100100001011101',
  '10111010111000011011101011101',
  '10000010110110010000101000001',
  '11111110101010101010101111111',
  '00000000101100100001000000000',
  '10111110011000000100001111100',
  '01000101010011111001011010001',
  '00000011110001110000001110000',
  '00100101101001010001011001010',
  '00101010000110100110100001100',
  '10111001100010011111101110001',
  '11001011110100011000110011100',
  '00010001000010101000001100010',
  '11001010101110010001000001100',
  '10100101101001111011111110101',
  '10110110111011110010101110100',
  '10100101110101001000001110010',
  '10110110111110110000111110111',
  '00000000111100011010100011111',
  '11111110001000011111101011100',
  '10000010101010111011100010010',
  '10111010101010010000111110100',
  '10111010100010111010010001111',
  '10111010101010010110011111110',
  '10000010010111011001101011010',
  '11111110111110110001001000100',
].join('');

function flat(m: boolean[][]): string {
  return m.map((row) => row.map((v) => (v ? '1' : '0')).join('')).join('');
}

const PAIRING_URL = 'https://heli.so/pair#c=eu-ABCDEFGHJK';

describe('encodeQr', () => {
  test('a pairing URL encodes to a known-good, scanner-verified matrix', () => {
    expect(flat(encodeQr(PAIRING_URL))).toBe(V3_PAIRING_URL);
  });

  test('picks the smallest version that fits', () => {
    // 21, 25, 29, 33… — version N is 4N + 17 modules square.
    expect(encodeQr('hi').length).toBe(21);
    expect(encodeQr(PAIRING_URL).length).toBe(29);
    expect(
      encodeQr('https://a-rather-long-self-hosted-domain.example.com/pair#c=local-0123456789').length
    ).toBe(37);
  });

  test('refuses a payload it cannot encode rather than truncating', () => {
    // A silently shortened URL yields a code that scans cleanly and goes
    // somewhere wrong, which is far worse than a thrown error.
    expect(() => encodeQr('x'.repeat(300))).toThrow(/does not fit/);
  });

  test('the finder separators are light', () => {
    const m = encodeQr(PAIRING_URL);
    const size = m.length;
    for (let i = 0; i < 8; i++) {
      expect(m[7][i]).toBe(false);
      expect(m[i][7]).toBe(false);
      expect(m[7][size - 1 - i]).toBe(false);
      expect(m[size - 1 - i][7]).toBe(false);
    }
  });

  test('the dark module is set', () => {
    const m = encodeQr(PAIRING_URL);
    // Always dark, at (4 * version + 9, 8). Its absence is a decoder failure.
    expect(m[m.length - 8][8]).toBe(true);
  });

  test('the timing patterns alternate', () => {
    const m = encodeQr(PAIRING_URL);
    for (let i = 8; i < m.length - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
  });
});

describe('Reed–Solomon', () => {
  test('generator polynomials match the published values', () => {
    expect(__test.generator(10).join(',')).toBe('1,216,194,159,111,199,94,95,113,157,193');
    expect(__test.generator(7).join(',')).toBe('1,127,122,154,164,11,68,117');
    expect(__test.generator(26).length).toBe(27);
  });

  test('error correction codewords are the right length', () => {
    expect(__test.ecCodewords([0x40, 0xb4, 0x84], 10)).toHaveLength(10);
  });
});
