/**
 * A QR encoder, in about three hundred lines.
 *
 * Byte mode, error-correction level M, versions 1–10. That is the whole of what
 * pairing needs: the payload is `https://<host>/pair#c=<region>-<10 chars>`,
 * around forty characters even for a long self-hosted domain, which fits
 * version 3 with room to spare.
 *
 * Why not a package: `qrcode` and friends bring a canvas or PNG writer and a
 * general-purpose encoder covering four modes, forty versions and Kanji. This
 * repo already hand-rolls PNG decoding and box-filter resizing in
 * `extension/scripts/resize.mjs` for the same reason, and the rule in CLAUDE.md
 * is explicit: default to no dependency.
 *
 * Why server-side: the output is a `boolean[][]`, rendered by the settings page
 * as `<rect>` elements inside an `<svg>`. Doing it in the browser would put an
 * encoder into the app-shell bundle that `scripts/check-budget.ts` measures, on
 * a page most people open twice. Returning a grid also means no `{@html}`, so
 * there is no sanitize question.
 */

/* ── GF(256) ─────────────────────────────────────────────────────────────── */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    // The QR primitive polynomial, 0x11d.
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Reed–Solomon generator polynomial of the given degree. */
function generator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function ecCodewords(data: number[], count: number): number[] {
  const gen = generator(count);
  const rem = new Array(count).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < count; i++) rem[i] ^= mul(gen[i + 1], factor);
  }
  return rem;
}

/* ── version tables (EC level M only) ────────────────────────────────────── */

/**
 * Per version: total data codewords, EC codewords per block, and the block
 * layout as [count, dataCodewordsPerBlock] groups.
 *
 * Only level M is tabulated. Supporting all four levels would quadruple this
 * table for no gain — M corrects ~15%, which is right for a code displayed on a
 * screen and scanned from thirty centimetres away.
 */
type VersionSpec = { ec: number; groups: [number, number][] };

const VERSIONS: Record<number, VersionSpec> = {
  1: { ec: 10, groups: [[1, 16]] },
  2: { ec: 16, groups: [[1, 28]] },
  3: { ec: 26, groups: [[1, 44]] },
  4: { ec: 18, groups: [[2, 32]] },
  5: { ec: 24, groups: [[2, 43]] },
  6: { ec: 16, groups: [[4, 27]] },
  7: { ec: 18, groups: [[4, 31]] },
  8: { ec: 22, groups: [[2, 38], [2, 39]] },
  9: { ec: 22, groups: [[3, 36], [2, 37]] },
  10: { ec: 26, groups: [[4, 43], [1, 44]] }
};

/** Where alignment patterns go, per version. */
const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50]
};

function dataCapacity(v: number): number {
  return VERSIONS[v].groups.reduce((n, [count, size]) => n + count * size, 0);
}

/* ── bit stream ──────────────────────────────────────────────────────────── */

class Bits {
  private bits: number[] = [];
  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
  }
  get length(): number {
    return this.bits.length;
  }
  toBytes(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | (this.bits[i + j] ?? 0);
      out.push(b);
    }
    return out;
  }
}

/* ── matrix ──────────────────────────────────────────────────────────────── */

type Cell = 0 | 1 | null;

function blank(size: number): Cell[][] {
  return Array.from({ length: size }, () => new Array<Cell>(size).fill(null));
}

/**
 * A 7×7 finder plus its one-module white separator.
 *
 * The loop deliberately runs -1..7 so the separator is written too, and the
 * `inFinder` guard is what keeps the two apart. Without it the `c === 0 ||
 * c === 6` edge test also fires on the separator ring at r/c = -1 and 7, which
 * paints a dark line down the side of every finder. The result still *looks*
 * like a QR code — three corners, right size — and no decoder will read it,
 * because locating a finder depends on the quiet separator around it.
 */
function placeFinder(m: Cell[][], row: number, col: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;

      const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      if (!inFinder) {
        m[rr][cc] = 0;
        continue;
      }
      const edge = r === 0 || r === 6 || c === 0 || c === 6;
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      m[rr][cc] = edge || core ? 1 : 0;
    }
  }
}

function placeFunctionPatterns(m: Cell[][], version: number): void {
  const size = m.length;
  placeFinder(m, 0, 0);
  placeFinder(m, 0, size - 7);
  placeFinder(m, size - 7, 0);

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    const bit: Cell = i % 2 === 0 ? 1 : 0;
    m[6][i] = bit;
    m[i][6] = bit;
  }

  // Alignment patterns, skipping the three that would sit on a finder.
  const centres = ALIGNMENT[version];
  for (const r of centres) {
    for (const c of centres) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          m[r + dr][c + dc] = ring === 1 ? 0 : 1;
        }
      }
    }
  }

  // Dark module.
  m[size - 8][8] = 1;
}

/** Reserve format (and, from v7, version) areas so data placement skips them. */
function reserve(m: Cell[][], version: number): void {
  const size = m.length;
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === null) m[8][i] = 0;
    if (m[i][8] === null) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = 0;
    if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = 0;
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        m[size - 11 + j][i] = 0;
        m[i][size - 11 + j] = 0;
      }
    }
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;

  // Rule 1: runs of five or more.
  for (const line of [
    ...m,
    ...Array.from({ length: n }, (_, c) => m.map((row) => row[c]))
  ]) {
    let run = 1;
    for (let i = 1; i < n; i++) {
      if (line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) score += 3 + (run - 5);
  }

  // Rule 2: 2×2 blocks of one colour.
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }

  // Rule 3: the finder-like 1:1:3:1:1 sequence.
  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const rev = [...pattern].reverse();
  const matches = (line: boolean[], at: number, pat: boolean[]) =>
    pat.every((v, i) => line[at + i] === v);
  for (const line of [
    ...m,
    ...Array.from({ length: n }, (_, c) => m.map((row) => row[c]))
  ]) {
    for (let i = 0; i + pattern.length <= n; i++) {
      if (matches(line, i, pattern) || matches(line, i, rev)) score += 40;
    }
  }

  // Rule 4: overall balance.
  const dark = m.flat().filter(Boolean).length;
  const ratio = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;

  return score;
}

function formatBits(mask: number): number {
  // EC level M is 0b00.
  const data = (0b00 << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) rem ^= 0b10100110111 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

function versionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((rem >> i) & 1) rem ^= 0b1111100100101 << (i - 12);
  }
  return (version << 12) | rem;
}

/* ── the encoder ─────────────────────────────────────────────────────────── */

/**
 * Encode `text` as a QR matrix. `true` is a dark module.
 *
 * Throws rather than truncating if the payload does not fit version 10 — a
 * silently shortened URL would produce a code that scans cleanly and goes
 * somewhere wrong, which is far worse than a build-time error.
 */
export function encodeQr(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)];

  const version = Number(
    Object.keys(VERSIONS).find((v) => {
      // 4 bits mode + 8 bits length (versions 1–9) or 16 (10+), then the data.
      const lengthBits = Number(v) < 10 ? 8 : 16;
      return dataCapacity(Number(v)) * 8 >= 4 + lengthBits + bytes.length * 8;
    }) ?? 0
  );
  if (!version) {
    throw new Error(`qr: ${bytes.length} bytes does not fit version 10 at EC level M`);
  }

  const spec = VERSIONS[version];
  const capacity = dataCapacity(version);
  const lengthBits = version < 10 ? 8 : 16;

  const bits = new Bits();
  bits.push(0b0100, 4); // byte mode
  bits.push(bytes.length, lengthBits);
  for (const b of bytes) bits.push(b, 8);

  // Terminator, then pad to a byte boundary, then the alternating pad bytes.
  bits.push(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0, 1);
  const data = bits.toBytes();
  const PAD = [0xec, 0x11];
  for (let i = 0; data.length < capacity; i++) data.push(PAD[i % 2]);

  // Split into blocks, compute EC per block, then interleave.
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let at = 0;
  for (const [count, size] of spec.groups) {
    for (let i = 0; i < count; i++) {
      const block = data.slice(at, at + size);
      at += size;
      blocks.push(block);
      ecBlocks.push(ecCodewords(block, spec.ec));
    }
  }

  const interleaved: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.length) interleaved.push(b[i]);
  }
  for (let i = 0; i < spec.ec; i++) {
    for (const b of ecBlocks) interleaved.push(b[i]);
  }

  const size = version * 4 + 17;
  const m = blank(size);
  placeFunctionPatterns(m, version);
  reserve(m, version);

  // Place data in the zigzag, skipping the vertical timing column.
  const stream: number[] = [];
  for (const byte of interleaved) {
    for (let i = 7; i >= 0; i--) stream.push((byte >> i) & 1);
  }
  let idx = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const col of [right, right - 1]) {
        if (m[row][col] !== null) continue;
        m[row][col] = ((stream[idx++] ?? 0) as Cell) === 1 ? 1 : 0;
      }
    }
    upward = !upward;
  }

  // Which modules are data (maskable) — anything the function patterns did not
  // claim. Recorded before masking, because masking rewrites the values.
  const isFunction = blank(size).map((row) => row.map(() => false)) as boolean[][];
  {
    const probe = blank(size);
    placeFunctionPatterns(probe, version);
    reserve(probe, version);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) isFunction[r][c] = probe[r][c] !== null;
    }
  }

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  let bestMask = 0;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = m.map((row, r) =>
      row.map((v, c) => {
        const on = v === 1;
        return isFunction[r][c] ? on : on !== MASKS[mask](r, c);
      })
    );
    applyFormat(candidate, mask, version);
    const score = penalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
      bestMask = mask;
    }
  }

  void bestMask;
  return best!;
}

function applyFormat(m: boolean[][], mask: number, version: number): void {
  const size = m.length;
  const fmt = formatBits(mask);
  for (let i = 0; i < 15; i++) {
    // Bit 14 first. The format string is written most-significant bit into the
    // *first* position of each copy, which is the opposite of the natural
    // `fmt >> i` reading — and getting it backwards produces a code whose
    // finders, timing and data are all perfect and which no scanner will read,
    // because the mask it advertises is the bit-reverse of the one applied.
    const on = ((fmt >> (14 - i)) & 1) === 1;
    // Copy 1, around the top-left finder.
    if (i < 6) m[8][i] = on;
    else if (i === 6) m[8][7] = on;
    else if (i === 7) m[8][8] = on;
    else if (i === 8) m[7][8] = on;
    else m[14 - i][8] = on;
    // Copy 2, split between the other two finders.
    if (i < 8) m[size - 1 - i][8] = on;
    else m[8][size - 15 + i] = on;
  }
  m[size - 8][8] = true; // dark module

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const on = ((bits >> i) & 1) === 1;
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      m[r][c] = on;
      m[c][r] = on;
    }
  }
}

/* ── test seam ───────────────────────────────────────────────────────────── */

/**
 * Internals exposed for `tests/qr.test.ts` only.
 *
 * The encoder is one exported function by design, but the two pure stages
 * inside it — the Reed–Solomon generator and the codeword stream — are where a
 * bug is silent and where known-good vectors from the spec exist. Testing
 * through `encodeQr` alone means a failure says "does not decode" and nothing
 * more, which is exactly the debugging experience this seam removes.
 */
export const __test = { generator, ecCodewords };
