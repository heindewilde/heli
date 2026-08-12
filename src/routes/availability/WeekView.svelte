<script lang="ts">
  /**
   * One week, day by day: who is on what on Tuesday.
   *
   * Rows are people, columns are the seven days. Each cell stacks the projects
   * that day carries, coloured by `projectColor` so the same engagement is
   * recognisable here, in the timeline and in the legend without reading the
   * label every time.
   *
   * Weekend columns are dimmed rather than hidden — someone booked on a
   * Saturday needs to be visible, and a five-column week would quietly drop
   * them.
   */
  import { formatHours } from '$lib/duration';
  import { projectFill, projectSwatch } from '$lib/projectColor';
  import { DAY_NAMES, MS_PER_DAY } from '$lib/weeks';
  import type { WeekDetail } from '$lib/server/capacity';

  type Props = { detail: WeekDetail };
  let { detail }: Props = $props();

  const GRID = 'grid-template-columns: 160px repeat(7, minmax(0, 1fr));';

  const dayLabel = (ts: number) => new Date(ts).getUTCDate();
  const isWeekend = (i: number) => i >= 5;

  /** Today, but only when today is actually inside the week being shown. */
  const todayIndex = $derived.by(() => {
    const now = Date.now();
    if (now < detail.week.start || now >= detail.week.end) return -1;
    return Math.floor((now - detail.week.start) / MS_PER_DAY);
  });

  /** Every project on screen, for the legend. */
  const legend = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const row of detail.rows) {
      for (const day of row.days) {
        for (const item of day.items) seen.set(item.projectId, item.projectName);
      }
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  });

  const dayTotals = $derived.by(() =>
    Array.from({ length: 7 }, (_, i) => detail.rows.reduce((n, r) => n + r.days[i].total, 0))
  );
</script>

{#if detail.rows.length === 0}
  <p class="text-sm text-[var(--color-muted)]">Nobody in this workspace yet.</p>
{:else}
  <div class="overflow-x-auto">
    <div class="min-w-[720px]">
      <!-- Day header -->
      <div class="grid gap-1 pb-2" style={GRID}>
        <div class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">
          Person
        </div>
        {#each DAY_NAMES as name, i (name)}
          <div
            class="flex items-baseline justify-center gap-1 rounded-[var(--radius-sm)] py-1 text-xs {i ===
            todayIndex
              ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-text)]'
              : isWeekend(i)
                ? 'text-[var(--color-subtle)]'
                : 'text-[var(--color-muted)]'}"
          >
            <span>{name}</span>
            <span class="tabular-nums opacity-70">{dayLabel(detail.week.start + i * MS_PER_DAY)}</span>
          </div>
        {/each}
      </div>

      <!-- Rows -->
      <div class="flex flex-col gap-1">
        {#each detail.rows as row (row.userId)}
          {@const over = row.weekTotal > row.capacityMinutes}
          <div class="grid gap-1" style={GRID}>
            <div class="flex min-w-0 flex-col justify-center pr-2">
              <span class="truncate text-sm">{row.name}</span>
              <span
                class="truncate text-xs tabular-nums {over
                  ? 'text-[var(--color-danger)]'
                  : 'text-[var(--color-subtle)]'}"
              >
                {formatHours(row.weekTotal)} of {formatHours(row.capacityMinutes)}
              </span>
            </div>

            {#each row.days as day (day.index)}
              <div
                class="flex min-h-16 flex-col gap-0.5 rounded-[var(--radius-sm)] border p-1 {isWeekend(
                  day.index
                )
                  ? 'border-dashed border-[var(--color-border)] bg-transparent'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)]'}"
              >
                {#each day.items as item (item.projectId)}
                  {@const fill = projectFill(item.projectId)}
                  <a
                    href="/projects/{item.projectId}"
                    title="{item.projectName} — {formatHours(item.minutes)}"
                    class="flex items-center gap-1 rounded-[var(--radius-sm)] border px-1 py-0.5 text-[0.6875rem] leading-tight transition-opacity hover:opacity-80"
                    style="border-color: {fill.border}; background: {fill.bg};"
                  >
                    <span class="min-w-0 flex-1 truncate">{item.projectName}</span>
                    <span class="shrink-0 tabular-nums opacity-70">{formatHours(item.minutes)}</span>
                  </a>
                {/each}
                {#if day.items.length === 0}
                  <span class="m-auto text-[0.6875rem] text-[var(--color-subtle)]">—</span>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>

      <!-- Day totals -->
      <div class="mt-2 grid gap-1 border-t border-[var(--color-border)] pt-2" style={GRID}>
        <div class="text-xs font-medium text-[var(--color-muted)]">Booked, all in</div>
        {#each dayTotals as total, i (i)}
          <div class="text-center text-[0.6875rem] tabular-nums text-[var(--color-muted)]">
            {total === 0 ? '—' : formatHours(total)}
          </div>
        {/each}
      </div>
    </div>
  </div>

  {#if legend.length > 0}
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
      {#each legend as p (p.id)}
        <span class="inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <span class="size-2 shrink-0 rounded-full" style="background: {projectSwatch(p.id)}"></span>
          {p.name}
        </span>
      {/each}
    </div>
  {/if}
{/if}
