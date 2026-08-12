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

/**
 * Which weekdays an allocation actually falls on, as a bitmask.
 *
 * Monday is bit 0 through Sunday bit 6, matching `weekStart`'s Monday anchor.
 * `null` means "unspecified" — the hours are simply spread across the span, and
 * every consumer must keep behaving exactly as it did before day patterns
 * existed. A bitmask rather than a join table because there are seven of them
 * and they are always read together with the row.
 */
export const MONDAY = 0;
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAY_MASK = 0b0011111; // Mon–Fri
export const FULL_WEEK_MASK = 0b1111111;

export function hasDay(mask: number, dayIndex: number): boolean {
  return (mask & (1 << dayIndex)) !== 0;
}

export function toggleDay(mask: number, dayIndex: number): number {
  return mask ^ (1 << dayIndex);
}

export function countDays(mask: number): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (hasDay(mask, i)) n++;
  return n;
}

/** `'Tue, Thu'`, or `'Mon–Fri'` for the common runs. */
export function describeDays(mask: number | null): string {
  if (mask == null || mask === 0) return 'Any day';
  if (mask === WEEKDAY_MASK) return 'Mon–Fri';
  if (mask === FULL_WEEK_MASK) return 'Every day';
  return DAY_NAMES.filter((_, i) => hasDay(mask, i)).join(', ');
}

/** Monday-relative index (0–6) of a timestamp. */
export function dayIndex(ts: number): number {
  return (new Date(ts).getUTCDay() + 6) % 7;
}

export type Span = { startDate: number; endDate: number; dayMask?: number | null };

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
 * The Monday-relative day indexes this span actually occupies in this week.
 *
 * With no `dayMask` every covered day counts, which is what the grid did before
 * patterns existed. With one, only the pattern's days that also fall inside the
 * covered range count — so a Tue/Thu allocation whose span ends on Wednesday
 * contributes Tuesday alone.
 */
export function coveredDays(span: Span, week: Week): number[] {
  const spanEndExclusive = span.endDate + MS_PER_DAY;
  const out: number[] = [];
  for (let i = 0; i < 7; i++) {
    const dayStart = week.start + i * MS_PER_DAY;
    if (dayStart < span.startDate || dayStart >= spanEndExclusive) continue;
    if (span.dayMask != null && span.dayMask !== 0 && !hasDay(span.dayMask, i)) continue;
    out.push(i);
  }
  return out;
}

/**
 * Minutes this allocation puts on a single day of the week.
 *
 * The weekly figure is divided across the pattern's days — 16h/wk on Tue+Thu is
 * 8h on each. Without a pattern the hours are spread across the whole covered
 * week, which is the only honest answer when nobody has said which days.
 */
export function minutesOnDay(
  span: Span & { minutesPerWeek: number },
  week: Week,
  dayIdx: number
): number {
  const covered = coveredDays(span, week);
  if (!covered.includes(dayIdx)) return 0;
  const divisor =
    span.dayMask != null && span.dayMask !== 0 ? countDays(span.dayMask) : 7;
  return Math.round(span.minutesPerWeek / divisor);
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
  // With a day pattern the week's total is the sum of the pattern days that
  // land inside it, so a Tue/Thu booking clipped to a Monday–Wednesday span
  // charges one day rather than three-sevenths of a week.
  if (span.dayMask != null && span.dayMask !== 0) {
    const covered = coveredDays(span, week);
    if (covered.length === 0) return 0;
    const perDay = span.minutesPerWeek / countDays(span.dayMask);
    return Math.round(perDay * covered.length);
  }

  const days = overlapDays(span, week);
  if (days === 0) return 0;
  if (days === 7) return span.minutesPerWeek;
  return Math.round((span.minutesPerWeek * days) / 7);
}
