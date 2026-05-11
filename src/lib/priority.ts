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

// Resolve a tone to the CSS variable consumers should paint with.
export function toneColor(tone: PriorityTone): string {
  return `var(--color-${tone})`;
}
