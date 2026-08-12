/**
 * Pure week arithmetic — no DB.
 *
 * The cases worth pinning are the ones that are wrong in every hand-rolled
 * version of this: the ISO year boundary, and pro-rating a span that starts
 * mid-week.
 */
import { describe, expect, test } from 'vitest';
import {
  MS_PER_DAY,
  MS_PER_WEEK,
  weekStart,
  weekKey,
  weeksFrom,
  overlapDays,
  minutesInWeek,
  startsMonth,
  type Week
} from '../src/lib/weeks';

const at = (iso: string) => Date.parse(iso);
const week = (mondayIso: string): Week => ({
  key: weekKey(at(mondayIso)),
  start: at(mondayIso),
  end: at(mondayIso) + MS_PER_WEEK
});

describe('weekStart', () => {
  test('snaps back to Monday UTC midnight', () => {
    // 2026-02-05 is a Thursday.
    expect(weekStart(at('2026-02-05T14:30:00Z'))).toBe(at('2026-02-02T00:00:00Z'));
    // A Monday is already its own week start.
    expect(weekStart(at('2026-02-02T00:00:00Z'))).toBe(at('2026-02-02T00:00:00Z'));
    // Sunday belongs to the week that began six days earlier, not the next one.
    expect(weekStart(at('2026-02-08T23:59:59Z'))).toBe(at('2026-02-02T00:00:00Z'));
  });
});

describe('weekKey', () => {
  test('is stable within a week and changes across one', () => {
    expect(weekKey(at('2026-02-02T00:00:00Z'))).toBe(weekKey(at('2026-02-08T23:00:00Z')));
    expect(weekKey(at('2026-02-09T00:00:00Z'))).not.toBe(weekKey(at('2026-02-08T00:00:00Z')));
  });

  test('a week spanning New Year gets one key, in its ISO year', () => {
    // Mon 2025-12-29 → Sun 2026-01-04. ISO week 1 of 2026, because its
    // Thursday (2026-01-01) falls in 2026. A naive "day of year / 7" would
    // label the two halves differently.
    const dec = weekKey(at('2025-12-29T00:00:00Z'));
    const jan = weekKey(at('2026-01-02T00:00:00Z'));
    expect(dec).toBe(jan);
    expect(dec).toBe('2026-W01');
  });

  test('sorts lexicographically in chronological order', () => {
    const keys = weeksFrom(at('2025-11-01T00:00:00Z'), 20).map((w) => w.key);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe('weeksFrom', () => {
  test('returns exactly the requested number of consecutive weeks', () => {
    const ws = weeksFrom(at('2026-02-05T00:00:00Z'), 12);
    expect(ws).toHaveLength(12);
    expect(ws[0].start).toBe(at('2026-02-02T00:00:00Z'));
    for (let i = 1; i < ws.length; i++) {
      expect(ws[i].start - ws[i - 1].start).toBe(MS_PER_WEEK);
      expect(ws[i - 1].end).toBe(ws[i].start);
    }
  });
});

describe('overlapDays', () => {
  const w = week('2026-02-02T00:00:00Z'); // Mon 2 Feb – Sun 8 Feb

  test('a span covering the whole week is 7 days', () => {
    expect(overlapDays({ startDate: at('2026-01-01'), endDate: at('2026-12-31') }, w)).toBe(7);
  });

  test('a span starting mid-week counts only the remaining days', () => {
    // Starts Wednesday: Wed, Thu, Fri, Sat, Sun = 5 days.
    expect(overlapDays({ startDate: at('2026-02-04'), endDate: at('2026-12-31') }, w)).toBe(5);
  });

  test('the end date is inclusive', () => {
    // Ending on Wednesday covers Mon, Tue, Wed = 3 days, not 2.
    expect(overlapDays({ startDate: at('2026-01-01'), endDate: at('2026-02-04') }, w)).toBe(3);
    // A single-day span on the Monday still counts as one day.
    expect(overlapDays({ startDate: at('2026-02-02'), endDate: at('2026-02-02') }, w)).toBe(1);
  });

  test('no overlap either side is zero', () => {
    expect(overlapDays({ startDate: at('2026-03-01'), endDate: at('2026-04-01') }, w)).toBe(0);
    expect(overlapDays({ startDate: at('2026-01-01'), endDate: at('2026-01-25') }, w)).toBe(0);
  });

  test('a span ending exactly on the Sunday still covers the whole week', () => {
    expect(overlapDays({ startDate: at('2026-02-02'), endDate: at('2026-02-08') }, w)).toBe(7);
  });
});

describe('minutesInWeek', () => {
  const w = week('2026-02-02T00:00:00Z');

  test('a full week contributes its full hours', () => {
    expect(
      minutesInWeek({ startDate: at('2026-01-01'), endDate: at('2026-12-31'), minutesPerWeek: 960 }, w)
    ).toBe(960);
  });

  test('a partial week is pro-rated by days', () => {
    // Wed–Sun is 5 of 7 days: 960 * 5/7 = 685.7 → 686.
    expect(
      minutesInWeek({ startDate: at('2026-02-04'), endDate: at('2026-12-31'), minutesPerWeek: 960 }, w)
    ).toBe(686);
  });

  test('no overlap contributes nothing', () => {
    expect(
      minutesInWeek({ startDate: at('2026-05-01'), endDate: at('2026-06-01'), minutesPerWeek: 960 }, w)
    ).toBe(0);
  });
});

describe('startsMonth', () => {
  test('is true for the week a month turns over in', () => {
    // Mon 2026-01-26 → Sun 2026-02-01 crosses into February.
    expect(startsMonth(week('2026-01-26T00:00:00Z'))).toBe(true);
    // Mon 2026-02-02 → Sun 2026-02-08 is entirely inside February.
    expect(startsMonth(week('2026-02-02T00:00:00Z'))).toBe(false);
  });

  test('is true when the Monday is itself the 1st', () => {
    // 2026-06-01 is a Monday.
    expect(startsMonth(week('2026-06-01T00:00:00Z'))).toBe(true);
  });
});

describe('constants', () => {
  test('are what they say', () => {
    expect(MS_PER_DAY).toBe(86_400_000);
    expect(MS_PER_WEEK).toBe(7 * MS_PER_DAY);
  });
});
