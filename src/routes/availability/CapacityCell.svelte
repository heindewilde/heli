<script lang="ts">
  /**
   * One member-week.
   *
   * Its own component because `Popover` owns a bindable `open`, and a parent
   * tracking `openFor = <cellId>` across hundreds of cells cannot bind to it.
   * Same reason `PipelineStageChip` and `StageColorPicker` exist.
   *
   * The fill is a plain div with a `--p` percentage custom property — the
   * technique from admin/Sparkline.svelte and Histogram.svelte. No SVG, no
   * charting dependency, and it lives next to its route like they do.
   *
   * The breakdown needs no round trip: `capacityWindow` already returns which
   * projects make up the number, because it had to add them up anyway.
   */
  import Popover from '$lib/ui/Popover.svelte';
  import { formatHours } from '$lib/duration';
  import type { Cell } from '$lib/server/capacity';

  type Props = {
    cell: Cell;
    capacityMinutes: number;
    memberName: string;
    weekLabel: string;
    /** Monday of this column, so the popover can open the day-level view. */
    weekStartsAt: number;
    /** Rules a heavier left border where a month turns over. */
    monthBoundary: boolean;
  };

  let { cell, capacityMinutes, memberName, weekLabel, weekStartsAt, monthBoundary }: Props =
    $props();

  const weekHref = $derived(
    `/availability?view=week&from=${new Date(weekStartsAt).toISOString().slice(0, 10)}`
  );

  const free = $derived(capacityMinutes - cell.allocated);
  const over = $derived(cell.allocated > capacityMinutes);
  /** Capped for the bar's width; `over` carries the rest of the meaning. */
  const pct = $derived(
    capacityMinutes <= 0
      ? cell.allocated > 0
        ? 100
        : 0
      : Math.min(100, Math.round((cell.allocated / capacityMinutes) * 100))
  );
  const empty = $derived(cell.allocated === 0);

  /**
   * Free hours, not booked hours. The question this page answers is "what can I
   * take on", so the number that should be readable without arithmetic is the
   * one you would quote a client.
   *
   * A fully-free week shows its number too. Blanking it was tempting — less
   * ink — but it put an empty cell next to numbered ones, which reads as
   * missing data rather than as the most available week on the row. It is also
   * the one cell whose number the total line at the bottom is definitely
   * counting.
   */
  const label = $derived(over ? `−${formatHours(-free)}` : formatHours(free));
</script>

<Popover label="{memberName}, week of {weekLabel}" placement="bottom">
  {#snippet trigger(attrs)}
    <button
      {...attrs}
      type="button"
      class="cell"
      class:over
      class:empty
      class:month={monthBoundary}
      style="--p: {pct}%"
      aria-label="{memberName}, week of {weekLabel}: {formatHours(cell.allocated)} booked of {formatHours(capacityMinutes)}"
    >
      <span class="fill"></span>
      <span class="num">{label}</span>
    </button>
  {/snippet}

  {#snippet content()}
    <div class="flex min-w-56 flex-col gap-2 p-1">
    <div>
      <div class="text-sm font-semibold text-[var(--color-text)]">{memberName}</div>
      <div class="text-xs text-[var(--color-muted)]">Week of {weekLabel}</div>
    </div>

    <dl class="flex flex-col gap-0.5 text-xs">
      <div class="flex justify-between gap-4">
        <dt class="text-[var(--color-muted)]">Capacity</dt>
        <dd class="tabular-nums">{formatHours(capacityMinutes)}</dd>
      </div>
      <div class="flex justify-between gap-4">
        <dt class="text-[var(--color-muted)]">Booked</dt>
        <dd class="tabular-nums">{formatHours(cell.allocated)}</dd>
      </div>
      <div class="flex justify-between gap-4 font-medium">
        <dt>{over ? 'Over by' : 'Free'}</dt>
        <dd class="tabular-nums {over ? 'text-[var(--color-danger)]' : ''}">
          {formatHours(Math.abs(free))}
        </dd>
      </div>
    </dl>

    {#if cell.projects.length > 0}
      <div class="border-t border-[var(--color-border)] pt-2">
        <ul class="flex flex-col gap-1">
          {#each cell.projects as p (p.projectId)}
            <li>
              <a
                href="/projects/{p.projectId}"
                class="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-1 py-0.5 text-xs hover:bg-[var(--color-surface)]"
              >
                <span class="min-w-0 flex-1 truncate">{p.projectName}</span>
                <span class="shrink-0 tabular-nums text-[var(--color-muted)]">
                  {formatHours(p.minutes)}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-muted)]">
        Nothing booked. All {formatHours(capacityMinutes)} available.
      </p>
    {/if}

    <!-- The obvious next question from a cell is "which days?", and that is a
         different view of the same week. -->
    <a
      href={weekHref}
      class="border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-muted)] underline hover:text-[var(--color-text)]"
    >See this week day by day</a>
    </div>
  {/snippet}
</Popover>

<style>
  .cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 2rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    overflow: hidden;
    font-variant-numeric: tabular-nums;
    font-size: 0.6875rem;
    transition: border-color 120ms;
  }
  .cell:hover {
    border-color: var(--color-border-strong);
  }
  /* A month boundary is a heavier left edge rather than a gap, so the columns
     stay on one rhythm. */
  .cell.month {
    border-left-color: var(--color-border-strong);
    border-left-width: 2px;
  }
  /* Nothing booked: no fill to draw, so the number carries it alone. */
  .cell.empty {
    background: var(--color-bg);
  }
  .cell.empty .num {
    color: var(--color-subtle);
  }

  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--p);
    background: var(--color-success-bg);
    border-right: 1px solid var(--color-success-border);
  }
  .cell.over .fill {
    background: var(--color-danger-bg);
    border-right-color: var(--color-danger-border);
  }

  .num {
    position: relative;
    color: var(--color-muted);
  }
  .cell.over .num {
    color: var(--color-danger);
    font-weight: 600;
  }
</style>
