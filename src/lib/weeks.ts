// Week bucketing for the availability grid. No dependencies — a date library
// is the obvious temptation here and this is about eighty lines of arithmetic.
//
// **Weeks are Monday-anchored and computed in UTC, on both sides of the wire.**
// The app has no workspace timezone setting anywhere (see `ics.ts`, which
// resolves TZID offsets per instant precisely because there is no tzdata), and
// introducing one for this is out of scope. UTC keeps the server's bucketing
// and the browser's column labels identical, which matters more here than
// matching any particular local midnight: an allocation is a statement about
// weeks, not about hours of a day.
//
// The visible consequence is that someone west of Greenwich sees a week start
// on what is still Sunday evening for them. Nothing is mis-summed by it; the
// same allocation lands in the same bucket for everyone looking at the board.

export const MS_PER_DAY = 86_400_000;
export const MS_PER_WEEK = 7 * MS_PER_DAY;

/** UTC midnight on the Monday of the week containing `ts`. */
export function weekStart(ts: number): number {
  const d = new Date(ts);
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  // getUTCDay: 0 = Sunday. Shift so Monday is 0.
  const offset = (d.getUTCDay() + 6) % 7;
  return utcMidnight - offset * MS_PER_DAY;
}

/**
 * ISO-8601 week key, `'2026-W07'`.
 *
 * Used as a map key and a Svelte `{#each}` key, so it has to be stable and
 * sortable. ISO's rule — the week containing the year's first Thursday is week
 * 1 — is why this is not simply "day of year over seven": at a year boundary
 * the ISO year and the calendar year disagree, and a naive key produces two
 * different labels for one week.
 */
export function weekKey(ts: number): string {
  const monday = new Date(weekStart(ts));
  // The Thursday of this week decides which ISO year the week belongs to.
  const thursday = new Date(monday.getTime() + 3 * MS_PER_DAY);
  const isoYear = thursday.getUTCFullYear();
  const jan1 = Date.UTC(isoYear, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / MS_PER_WEEK) + 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export type Week = {
  /** ISO key, stable across server and client. */
  key: string;
  /** UTC midnight Monday. */
  start: number;
  /** UTC midnight the following Monday — exclusive. */
  end: number;
};

/**
 * `count` consecutive weeks starting with the week containing `from`.
 *
 * Counted rather than derived from a `to` date so the caller controls the
 * column count exactly — a horizon of "12 weeks" should be twelve columns
 * regardless of which day of the week it starts on.
 */
export function weeksFrom(from: number, count: number): Week[] {
  const first = weekStart(from);
  const out: Week[] = [];
  for (let i = 0; i < count; i++) {
    const start = first + i * MS_PER_WEEK;
    out.push({ key: weekKey(start), start, end: start + MS_PER_WEEK });
  }
  return out;
}

/** A short column label, `'3 Feb'`. Rendered from the UTC Monday. */
export function weekLabel(start: number): string {
  const d = new Date(start);
  return `${d.getUTCDate()} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })}`;
}

/** True when a week begins a new month — the grid rules a line there. */
export function startsMonth(week: Week): boolean {
  const d = new Date(week.start);
  // The month changes within this week if the Monday and the following Sunday
  // fall in different months, or the Monday is the 1st.
  const sunday = new Date(week.start + 6 * MS_PER_DAY);
  return d.getUTCDate() === 1 || d.getUTCMonth() !== sunday.getUTCMonth();
}

/** Month name for a week, for the header band. */
export function monthLabel(start: number): string {
  return new Date(start).toLocaleString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export type Span = { startDate: number; endDate: number };

/**
 * How many days of `week` the span [startDate, endDate] covers, 0–7.
 *
 * `endDate` is treated as **inclusive**: an allocation running "to 30 June"
 * includes the 30th, which is what someone typing that date means. So the
 * comparison is against the end of that day, not its midnight.
 */
export function overlapDays(span: Span, week: Week): number {
  const spanEndExclusive = span.endDate + MS_PER_DAY;
  const from = Math.max(span.startDate, week.start);
  const to = Math.min(spanEndExclusive, week.end);
  if (to <= from) return 0;
  return Math.min(7, Math.round((to - from) / MS_PER_DAY));
}

/**
 * The minutes an allocation contributes to one week.
 *
 * Pro-rated by days covered, so a span that starts on a Wednesday contributes
 * 3/7 of its weekly hours to that week rather than all of them. Without this a
 * one-day engagement would read as a full week of commitment, and every
 * boundary week would overstate the load.
 */
export function minutesInWeek(
  span: Span & { minutesPerWeek: number },
  week: Week
): number {
  const days = overlapDays(span, week);
  if (days === 0) return 0;
  if (days === 7) return span.minutesPerWeek;
  return Math.round((span.minutesPerWeek * days) / 7);
}
