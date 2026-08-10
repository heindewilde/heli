export type StageColor = 'gray' | 'sky' | 'green' | 'yellow' | 'orange' | 'red' | 'violet' | 'pink';

export const STAGE_COLORS: StageColor[] = [
  'gray', 'sky', 'green', 'yellow', 'orange', 'red', 'violet', 'pink'
];

// The values live in `@theme` / `[data-theme='dark']` in src/app.css, not here.
// As literals these were light-mode only — a 97%-lightness column background
// is invisible on a dark surface — and nothing in a TS module can respond to
// the theme attribute. Emitting `var()` keeps every call site unchanged (they
// are all inline `style=` attributes) while letting the cascade do the work.

export const STAGE_COLOR_SWATCH: Record<StageColor, string> = {
  gray:   'var(--stage-gray-swatch)',
  sky:    'var(--stage-sky-swatch)',
  green:  'var(--stage-green-swatch)',
  yellow: 'var(--stage-yellow-swatch)',
  orange: 'var(--stage-orange-swatch)',
  red:    'var(--stage-red-swatch)',
  violet: 'var(--stage-violet-swatch)',
  pink:   'var(--stage-pink-swatch)',
};

export const STAGE_COLOR_BOARD: Record<StageColor, { border: string; bg: string }> = {
  gray:   { border: 'var(--stage-gray-border)',   bg: 'var(--stage-gray-bg)' },
  sky:    { border: 'var(--stage-sky-border)',    bg: 'var(--stage-sky-bg)' },
  green:  { border: 'var(--stage-green-border)',  bg: 'var(--stage-green-bg)' },
  yellow: { border: 'var(--stage-yellow-border)', bg: 'var(--stage-yellow-bg)' },
  orange: { border: 'var(--stage-orange-border)', bg: 'var(--stage-orange-bg)' },
  red:    { border: 'var(--stage-red-border)',    bg: 'var(--stage-red-bg)' },
  violet: { border: 'var(--stage-violet-border)', bg: 'var(--stage-violet-bg)' },
  pink:   { border: 'var(--stage-pink-border)',   bg: 'var(--stage-pink-bg)' },
};

export function colorToKind(color: string | null | undefined): 'open' | 'won' | 'lost' {
  if (color === 'green') return 'won';
  if (color === 'red') return 'lost';
  return 'open';
}
