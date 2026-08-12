// Client-side helpers + the canonical tone palette.
// Server stores `tone` as one of these strings; the UI maps them to a
// concrete CSS color at render time. Keeping the source list in sync with
// the server `STATUS_TONES` is enforced by the union type below — if you
// add a tone to one, TypeScript will flag the other.

export type StatusTone = 'gray' | 'blue' | 'green' | 'amber' | 'red';

export const STATUS_TONE_LIST: StatusTone[] = ['gray', 'blue', 'green', 'amber', 'red'];

export type StatusRow = {
  id: string;
  name: string;
  tone: StatusTone;
  sortOrder: number;
};

type ToneParts = { dot: string; text: string; bg: string; border: string };

// The tokens each tone resolves to — text + dot share the same hue but at
// different intensities so the pill reads from across the table without
// shouting. Each maps to existing semantic tokens so dark mode follows.
//
// The names are the shared layer, for the same reason as `stageColors.ts`: a
// `var()` reference needs a cascade and React Native has none, so the mobile
// app resolves these names against the theme generated from src/app.css.
// `TONE_STYLES` is derived, so a renamed token cannot reach one platform only.
export const TONE_TOKENS: Record<StatusTone, ToneParts> = {
  gray:  { dot: '--color-subtle',  text: '--color-muted',   bg: '--color-surface-2',   border: '--color-border' },
  blue:  { dot: '--color-info',    text: '--color-info',    bg: '--color-info-bg',     border: '--color-info-border' },
  green: { dot: '--color-success', text: '--color-success', bg: '--color-success-bg',  border: '--color-success-border' },
  amber: { dot: '--color-warning', text: '--color-warning', bg: '--color-warning-bg',  border: '--color-warning-border' },
  red:   { dot: '--color-danger',  text: '--color-danger',  bg: '--color-danger-bg',   border: '--color-danger-border' }
};

// Resolved colors for each tone, as inline `style=` values.
export const TONE_STYLES: Record<StatusTone, ToneParts> = Object.fromEntries(
  STATUS_TONE_LIST.map((tone) => {
    const t = TONE_TOKENS[tone];
    return [
      tone,
      { dot: `var(${t.dot})`, text: `var(${t.text})`, bg: `var(${t.bg})`, border: `var(${t.border})` }
    ];
  })
) as Record<StatusTone, ToneParts>;
