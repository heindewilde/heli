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

// Resolved colors for each tone — text + dot share the same hue but at
// different intensities so the pill reads from across the table without
// shouting. Each maps to existing semantic tokens so dark mode follows.
export const TONE_STYLES: Record<StatusTone, { dot: string; text: string; bg: string; border: string }> = {
  gray:  { dot: 'var(--color-subtle)',  text: 'var(--color-muted)',   bg: 'var(--color-surface-2)',     border: 'var(--color-border)' },
  blue:  { dot: 'var(--color-info)',    text: 'var(--color-info)',    bg: 'var(--color-info-bg)',       border: 'var(--color-info-border)' },
  green: { dot: 'var(--color-success)', text: 'var(--color-success)', bg: 'var(--color-success-bg)',    border: 'var(--color-success-border)' },
  amber: { dot: 'var(--color-warning)', text: 'var(--color-warning)', bg: 'var(--color-warning-bg)',    border: 'var(--color-warning-border)' },
  red:   { dot: 'var(--color-danger)',  text: 'var(--color-danger)',  bg: 'var(--color-danger-bg)',     border: 'var(--color-danger-border)' }
};
