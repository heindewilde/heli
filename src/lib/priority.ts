// Priority is stored as a small integer for cheap indexing and sorting:
//   1 = High, 2 = Medium, 3 = Low, NULL = No priority.
// "No priority" must remain the default — most rows will have this and the
// table should be visually quiet for them.

export type Priority = 1 | 2 | 3 | null;

export const PRIORITIES: { value: Priority; label: string; tone: string; cssColor: string }[] = [
  // `cssColor` is the actual color used for the flag fill/stroke. We pick
  // semantic tokens so light/dark modes both look right.
  { value: 1, label: 'High', tone: 'danger', cssColor: 'var(--color-danger)' },
  { value: 2, label: 'Medium', tone: 'warning', cssColor: 'var(--color-warning)' },
  { value: 3, label: 'Low', tone: 'info', cssColor: 'var(--color-info)' },
  { value: null, label: 'No priority', tone: 'subtle', cssColor: 'var(--color-subtle)' }
];

export function priorityMeta(p: Priority) {
  return PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[3];
}
