/**
 * FTS5 query helpers. SQLite FTS5 has its own MATCH grammar; raw user input
 * can blow up with reserved characters (`"`, `*`, `:`, etc.). We normalize
 * to a prefix-match-per-token query.
 */

const FTS_RESERVED = /[\"():*]/g;

export function ftsQuery(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.replace(FTS_RESERVED, '').trim())
    .filter((t) => t.length >= 1)
    .map((t) => `"${t}"*`); // each token: literal-quote + prefix wildcard
  if (tokens.length === 0) return null;
  return tokens.join(' ');
}
