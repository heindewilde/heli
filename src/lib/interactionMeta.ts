/**
 * Interaction vocabulary and timeline formatting, with no dependencies.
 *
 * Split from `interactions.ts` for the same reason `interactionTypes.ts` was
 * split before it: that module imports `lucide-svelte` for the type icons,
 * which makes every function beside them unusable anywhere there is no Svelte —
 * the server, the tests, and now the mobile app, which imports this file
 * directly by relative path.
 *
 * `interactions.ts` re-exports all of this, so every existing `$lib/interactions`
 * call site keeps working and there is one definition rather than two.
 *
 * Note what is deliberately *not* here: the Tailwind class strings. Tailwind v4
 * extracts classes by scanning source text, so `text-[var(--color-info)]` has to
 * appear as a literal in a file it scans. Building it at runtime from
 * `TYPE_TONE_TOKEN` below would compile fine and silently ship no colour. The
 * token names are for consumers that resolve colours themselves; the web keeps
 * its literals.
 */

import { calendarLabel, startOfDay, timeLabel } from './dates';
import type { InteractionType } from './interactionTypes';

export const TYPE_LABELS: Record<InteractionType, string> = {
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  dm: 'DM',
  event: 'Event',
  note: 'Note',
  other: 'Other'
};

/**
 * The custom property each type's tone resolves to.
 *
 * Interaction tones are deliberately quiet. The icon carries the type; colour is
 * a faint accent, not a banner. Synchronous modes (call, meeting, event) share
 * the warmer info hue; async ones (email, dm, note) sit on the muted-text family
 * so they blend into the timeline.
 */
export const TYPE_TONE_TOKEN: Record<InteractionType, string> = {
  call: '--color-info',
  email: '--color-muted',
  meeting: '--color-info',
  dm: '--color-muted',
  event: '--color-warning',
  note: '--color-muted',
  other: '--color-subtle'
};

export function dayBucket(ts: number, today = new Date()): { key: string; label: string } {
  const d = new Date(ts);
  const todayStart = startOfDay(today);
  const dStart = startOfDay(d);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (dStart === todayStart) return { key, label: 'Today' };
  // Yesterday, not Tomorrow: this buckets an activity feed, which only ever
  // looks backwards. The due-date chip is the forward-facing twin.
  if (dStart === todayStart - 86_400_000) return { key, label: 'Yesterday' };
  return { key, label: calendarLabel(d, today) };
}

export function formatTime(ts: number): string {
  return timeLabel(new Date(ts));
}

export function formatLastSeen(ts: number | null): string {
  if (ts == null) return '';
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'today';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function toLocalDatetimeInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalDatetimeInput(value: string): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}
