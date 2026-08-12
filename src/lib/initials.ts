/**
 * Initials for an avatar fallback.
 *
 * There were four of these, near-identical and subtly not: two dropped the
 * leading `trim()`, and the command palette's sliced to two words *before*
 * filtering out the empties, so a name with a leading space produced one
 * initial instead of two. They are one function now.
 *
 * `[...w][0]` rather than `w[0]`: a name beginning with an astral character —
 * an emoji, or anything outside the BMP — is two UTF-16 code units, and taking
 * the first one yields a lone surrogate that renders as a replacement glyph.
 *
 * "Karen Sparck Jones" → "KS".
 */
export function initialsOf(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase() ?? '')
    .join('');
}
