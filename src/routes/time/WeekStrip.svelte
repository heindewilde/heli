<script lang="ts">
  /**
   * The range at a glance, and the day navigator.
   *
   * One bar per day, scaled against the busiest day rather than against
   * capacity — the point is the *shape* of the range, and scaling to a
   * theoretical daily maximum flattens every real week into stubs. Capacity
   * shows as the number beside the total instead, where it can be read exactly.
   *
   * Buckets are computed from the entries the list is already rendering, not
   * from a second query. That is not just cheaper: day boundaries are local
   * (`dayBucket`), the server has no timezone for the user, and two independent
   * bucketings would disagree at midnight.
   */
  import { formatMinutes, formatHours } from '$lib/duration';
  import { MS_PER_DAY } from '$lib/weeks';
  import type { TimeEntryRow } from '$lib/server/time';

  type Props = {
    entries: TimeEntryRow[];
    from: number;
    to: number;
    capacityMinutes: number;
    /** The day currently filtered to, or null for the whole range. */
    activeDay: number | null;
    onPickDay: (dayStart: number | null) => void;
  };

  let { entries, from, to, capacityMinutes, activeDay, onPickDay }: Props = $props();

  /** Local midnight, matching how the list groups days. */
  const startOfDay = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const days = $derived.by(() => {
    const first = startOfDay(from);
    const last = startOfDay(to);
    const count = Math.round((last - first) / MS_PER_DAY) + 1;
    // Beyond a month the strip stops being readable; the caller hides it.
    return Array.from({ length: Math.max(0, count) }, (_, i) => first + i * MS_PER_DAY);
  });

  const byDay = $derived.by(() => {
    const map = new Map<number, number>();
    for (const e of entries) {
      if (e.endedAt == null) continue;
      const key = startOfDay(e.startedAt);
      map.set(key, (map.get(key) ?? 0) + Math.round((e.endedAt - e.startedAt) / 60_000));
    }
    return map;
  });

  const total = $derived([...byDay.values()].reduce((n, m) => n + m, 0));
  const peak = $derived(Math.max(1, ...byDay.values()));

  const todayStart = startOfDay(Date.now());
  const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const label = $derived(days.length === 7 ? 'This range · 7 days' : `${days.length} days`);
</script>

<div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <span class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">
      {label}
    </span>
    <span class="text-sm tabular-nums">
      <span class="font-medium">{formatMinutes(total)}</span>
      {#if capacityMinutes > 0}
        <span class="text-[var(--color-muted)]"> of {formatHours(capacityMinutes)}</span>
      {/if}
    </span>
  </div>

  <div class="flex items-end gap-1" role="group" aria-label="Days in range">
    {#each days as day (day)}
      {@const minutes = byDay.get(day) ?? 0}
      {@const active = activeDay === day}
      {@const isToday = day === todayStart}
      <button
        type="button"
        aria-pressed={active}
        onclick={() => onPickDay(active ? null : day)}
        title="{new Date(day).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        })} — {formatMinutes(minutes)}"
        class="group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[var(--radius-sm)] px-0.5 pb-1 pt-2 transition-colors {active
          ? 'bg-[var(--color-accent-soft)]'
          : 'hover:bg-[var(--color-surface-2)]'}"
      >
        <span class="flex h-12 w-full items-end justify-center">
          <span
            class="bar w-full rounded-sm"
            class:empty={minutes === 0}
            style="--h: {minutes === 0 ? 2 : Math.max(6, (minutes / peak) * 100)}%"
          ></span>
        </span>
        <span
          class="text-[0.6875rem] tabular-nums {isToday
            ? 'font-semibold text-[var(--color-text)]'
            : 'text-[var(--color-subtle)]'}"
        >{DOW[new Date(day).getDay()]}</span>
      </button>
    {/each}
  </div>

  {#if activeDay !== null}
    <button
      type="button"
      onclick={() => onPickDay(null)}
      class="self-start text-xs text-[var(--color-muted)] underline hover:text-[var(--color-text)]"
    >Showing one day — clear</button>
  {/if}
</div>

<style>
  .bar {
    height: var(--h);
    background: var(--color-accent);
    opacity: 0.85;
    transition: opacity 120ms;
  }
  .bar.empty {
    background: var(--color-border-strong);
  }
  .group:hover .bar {
    opacity: 1;
  }
</style>
