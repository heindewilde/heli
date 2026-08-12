export type StageColor = 'gray' | 'sky' | 'green' | 'yellow' | 'orange' | 'red' | 'violet' | 'pink';

export const STAGE_COLORS: StageColor[] = [
  'gray', 'sky', 'green', 'yellow', 'orange', 'red', 'violet', 'pink'
];

// The values live in `@theme` / `[data-theme='dark']` in src/app.css, not here.
// As literals these were light-mode only — a 97%-lightness column background
// is invisible on a dark surface — and nothing in a TS module can respond to
// the theme attribute. Emitting `var()` keeps every call site unchanged (they
// are all inline `style=` attributes) while letting the cascade do the work.
//
// The *names* are the shared layer. A `var()` reference only means anything
// where there is a cascade, and React Native has none — the mobile app resolves
// these names against the theme object generated from src/app.css instead. Both
// spellings are derived from one map below, so a renamed token cannot reach one
// platform and miss the other.

export const STAGE_COLOR_TOKENS: Record<
  StageColor,
  { swatch: string; border: string; bg: string }
> = {
  gray:   { swatch: '--stage-gray-swatch',   border: '--stage-gray-border',   bg: '--stage-gray-bg' },
  sky:    { swatch: '--stage-sky-swatch',    border: '--stage-sky-border',    bg: '--stage-sky-bg' },
  green:  { swatch: '--stage-green-swatch',  border: '--stage-green-border',  bg: '--stage-green-bg' },
  yellow: { swatch: '--stage-yellow-swatch', border: '--stage-yellow-border', bg: '--stage-yellow-bg' },
  orange: { swatch: '--stage-orange-swatch', border: '--stage-orange-border', bg: '--stage-orange-bg' },
  red:    { swatch: '--stage-red-swatch',    border: '--stage-red-border',    bg: '--stage-red-bg' },
  violet: { swatch: '--stage-violet-swatch', border: '--stage-violet-border', bg: '--stage-violet-bg' },
  pink:   { swatch: '--stage-pink-swatch',   border: '--stage-pink-border',   bg: '--stage-pink-bg' }
};

const cssVar = (token: string) => `var(${token})`;

export const STAGE_COLOR_SWATCH: Record<StageColor, string> = Object.fromEntries(
  STAGE_COLORS.map((c) => [c, cssVar(STAGE_COLOR_TOKENS[c].swatch)])
) as Record<StageColor, string>;

export const STAGE_COLOR_BOARD: Record<StageColor, { border: string; bg: string }> =
  Object.fromEntries(
    STAGE_COLORS.map((c) => [
      c,
      { border: cssVar(STAGE_COLOR_TOKENS[c].border), bg: cssVar(STAGE_COLOR_TOKENS[c].bg) }
    ])
  ) as Record<StageColor, { border: string; bg: string }>;

export function colorToKind(color: string | null | undefined): 'open' | 'won' | 'lost' {
  if (color === 'green') return 'won';
  if (color === 'red') return 'lost';
  return 'open';
}
