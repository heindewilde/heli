/**
 * The bits of date formatting that really are shared.
 *
 * There are several date helpers in the app and most of them *look* alike
 * without being alike: the activity feed buckets by Today/Yesterday, the due
 * date chip says Today/Tomorrow, the reminders popover adds a time, and three
 * more render an "N ago" with different granularity. Collapsing those into one
 * function with a mode parameter would be a switch over its own call sites.
 *
 * What they genuinely share is the fallback spelling of a date that is neither
 * today nor adjacent to it — and the rule that the year only appears when it
 * differs from the current one. That is here, so a change to the format reaches
 * every surface instead of one.
 */

/** Local midnight, for comparing two instants by calendar day. */
export function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a) === startOfDay(b);
}

/**
 * "Mon, 3 Feb", or "Mon, 3 Feb 2024" when the year differs from `relativeTo`.
 *
 * Locale-driven throughout: the option set is fixed, the ordering and separators
 * are the browser's.
 */
export function calendarLabel(d: Date, relativeTo: Date = new Date()): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === relativeTo.getFullYear() ? undefined : 'numeric'
  });
}

/** Locale short time, e.g. "09:30". */
export function timeLabel(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
