/**
 * Subsequence scoring for the command palette's *commands* — not for entities.
 *
 * Entity search stays on the server: FTS5 plus the LRU in search.ts already
 * ranks well, handles the scope prefixes, and does not need the whole workspace
 * shipped to the browser to work. This is only ever asked to order a few dozen
 * known strings, which is exactly the case where a 50-line matcher beats a
 * dependency.
 */

const SCORE_WORD_BOUNDARY = 12;
// Deliberately above the boundary bonus. With them the other way round,
// "arch" scored "a random chive" (three word-initials) above "archive" (one
// contiguous run) — the opposite of what anyone typing "arch" means.
const SCORE_CONSECUTIVE = 16;
const SCORE_MATCH = 2;
const PENALTY_LEADING_GAP = 3;
const PENALTY_GAP = 1;

function isBoundary(prev: string | undefined): boolean {
  if (prev === undefined) return true;
  return prev === ' ' || prev === '-' || prev === '_' || prev === '/' || prev === '.';
}

/**
 * Returns a score, or null when `query` is not a subsequence of `text`.
 * Higher is better. An empty query scores 0 and matches everything, which is
 * what makes "show me the default list" fall out for free.
 */
export function fuzzyScore(text: string, query: string): number | null {
  if (!query) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  let score = 0;
  let ti = 0;
  let lastMatch = -1;

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;

    score += SCORE_MATCH;
    if (isBoundary(t[found - 1])) score += SCORE_WORD_BOUNDARY;
    if (found === lastMatch + 1) score += SCORE_CONSECUTIVE;
    // A gap early in the string is cheaper than a gap late in it: "np" should
    // prefer "New person" over "Open pipeline".
    else if (lastMatch === -1) score -= Math.min(found, 10) * PENALTY_LEADING_GAP;
    else score -= Math.min(found - lastMatch - 1, 10) * PENALTY_GAP;

    lastMatch = found;
    ti = found + 1;
  }

  // Prefer the shorter of two otherwise-equal matches.
  return score - Math.max(0, t.length - q.length) * 0.05;
}

export type Scored<T> = { item: T; score: number };

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  keys: (item: T) => string[]
): Scored<T>[] {
  const out: Scored<T>[] = [];
  for (const item of items) {
    let best: number | null = null;
    for (const key of keys(item)) {
      const s = fuzzyScore(key, query);
      if (s !== null && (best === null || s > best)) best = s;
    }
    if (best !== null) out.push({ item, score: best });
  }
  // Stable: equal scores keep registration order, which is the order a human
  // author chose.
  return out
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.score - a.s.score || a.i - b.i)
    .map(({ s }) => s);
}
