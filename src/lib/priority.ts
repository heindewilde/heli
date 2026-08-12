// Priority is stored as a small integer for cheap indexing and sorting:
//   1 = High, 2 = Medium, 3 = Low, NULL = No priority.
// NULL must remain the default — most rows have this and the table should
// be visually quiet for them.

export type Priority = 1 | 2 | 3 | null;

export type PriorityTone = 'danger' | 'warning' | 'info' | 'subtle';

export const PRIORITIES: { value: Priority; label: string; tone: PriorityTone }[] = [
  { value: 1, label: 'High', tone: 'danger' },
  { value: 2, label: 'Medium', tone: 'warning' },
  { value: 3, label: 'Low', tone: 'info' },
  { value: null, label: 'No priority', tone: 'subtle' }
];

export function priorityMeta(p: Priority) {
  return PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[3];
}

// The custom property a tone resolves to. The name is the shared layer: a
// `var()` reference only means something where there is a cascade, and React
// Native has none, so the mobile app resolves this name against the theme
// object generated from src/app.css. `toneColor` is derived from it so the two
// spellings cannot drift.
export function toneToken(tone: PriorityTone): string {
  return `--color-${tone}`;
}

// Resolve a tone to the CSS variable consumers should paint with.
export function toneColor(tone: PriorityTone): string {
  return `var(${toneToken(tone)})`;
}
