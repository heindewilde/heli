// Durations, in integer minutes, with no dependencies.
//
// Minutes are the storage unit everywhere (allocations, time entries) for the
// same reason money is stored in cents: "7.5 hours" is 450, and 450 always adds
// up. Nothing in the schema holds a float.
//
// Isomorphic on purpose — the server computes availability with these and the
// browser renders it, so a rounding difference between the two is impossible.

/**
 * What a member is assumed to have available when nobody has said otherwise.
 *
 * Lives here rather than in `schema.ts` because Settings and the availability
 * grid both render it, and importing a *value* from the schema would pull
 * Drizzle into the browser bundle. Re-exported from `schema.ts` for server
 * callers — same split as `$lib/projectTypes`.
 */
export const DEFAULT_WEEKLY_CAPACITY_MINUTES = 40 * 60;

/** `"6h 30m"`, `"45m"`, `"6h"`, `"0m"`. */
export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}

/**
 * `"7.5h"`, for headline numbers where `"7h 30m"` is too busy.
 *
 * One decimal place, and the `.0` is dropped — a column of `16h`, `7.5h`, `40h`
 * reads better than `16.0h`.
 */
export function formatHours(total: number): string {
  const hours = Math.round((total / 60) * 10) / 10;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

/** Minutes as a decimal number of hours, for prefilling an input. */
export function minutesToHours(total: number): number {
  return Math.round((total / 60) * 100) / 100;
}

/**
 * Read a number of hours typed by a person into whole minutes.
 *
 * Accepts `"7.5"`, `"7,5"` (comma decimals are the norm in most of Europe, and
 * this app is written in Amsterdam) and `"16"`. Returns null on anything else,
 * so a caller can tell "empty" from "zero".
 */
export function hoursToMinutes(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 60);
}

/**
 * Read a duration typed in any of the shapes people actually type.
 *
 * `"1:30"` → 90, `"1.5h"` → 90, `"90m"` → 90, `"90"` → 90, `"2h15"` → 135.
 * A bare number is minutes, because that is what a timer edit means; hours-only
 * entry goes through `hoursToMinutes` instead, where the field is labelled.
 *
 * Returns null rather than 0 on garbage, so the caller can leave the value
 * alone instead of silently zeroing someone's afternoon.
 */
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(',', '.');
  if (!s) return null;

  // 1:30 — hours and minutes.
  const colon = /^(\d+):([0-5]?\d)$/.exec(s);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);

  // 2h15, 2h 15m, 2h, 1.5h
  const hm = /^(\d+(?:\.\d+)?)\s*h\s*(\d+)?\s*m?$/.exec(s);
  if (hm) {
    const hours = Number(hm[1]);
    const mins = hm[2] ? Number(hm[2]) : 0;
    // "1.5h30m" is a contradiction; take the fractional hours as authoritative
    // only when no minutes were also given.
    if (mins > 59) return null;
    return Math.round(hours * 60) + mins;
  }

  // 90m
  const mOnly = /^(\d+(?:\.\d+)?)\s*m$/.exec(s);
  if (mOnly) return Math.round(Number(mOnly[1]));

  // Bare number: minutes.
  const bare = /^\d+(?:\.\d+)?$/.exec(s);
  if (bare) return Math.round(Number(s));

  return null;
}
