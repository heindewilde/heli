<script lang="ts">
  /**
   * Rows are projects, bars run start → end: the engagement schedule rather
   * than the people. Answers "what is running in November", where the grid
   * answers "who is free".
   *
   * The bar is positioned as a percentage of the window rather than in pixels,
   * so it survives any container width without measuring anything. Bars are
   * clamped to the window and the clamp is *shown* — a flat edge where the
   * engagement continues past the horizon would read as an end date.
   */
  import { formatHours } from '$lib/duration';
  import { projectFill, projectSwatch } from '$lib/projectColor';
  import { monthLabel, startsMonth, MS_PER_DAY, type Week } from '$lib/weeks';
  import type { TimelineBar } from '$lib/server/capacity';

  type Props = { weeks: Week[]; bars: TimelineBar[] };
  let { weeks, bars }: Props = $props();

  const windowStart = $derived(weeks[0]?.start ?? 0);
  const windowEnd = $derived(weeks[weeks.length - 1]?.end ?? 1);
  const span = $derived(Math.max(1, windowEnd - windowStart));

  const pct = (ts: number) => ((ts - windowStart) / span) * 100;

  function geometry(bar: TimelineBar) {
    // endDate is inclusive, so the bar runs to the end of that day.
    const rawStart = bar.startDate;
    const rawEnd = bar.endDate + MS_PER_DAY;
    const left = Math.max(0, pct(rawStart));
    const right = Math.min(100, pct(rawEnd));
    return {
      left,
      width: Math.max(1.2, right - left),
      clippedStart: rawStart < windowStart,
      clippedEnd: rawEnd > windowEnd
    };
  }

  const monthSpans = $derived.by(() => {
    const out: { key: string; label: string; span: number }[] = [];
    for (const w of weeks) {
      const label = monthLabel(w.start);
      const last = out[out.length - 1];
      if (last && last.label === label) last.span += 1;
      else out.push({ key: w.key, label, span: 1 });
    }
    return out;
  });

  const nowPct = $derived.by(() => {
    const now = Date.now();
    if (now < windowStart || now > windowEnd) return null;
    return pct(now);
  });

  const GRID = $derived(
    `grid-template-columns: 200px repeat(${Math.max(1, weeks.length)}, minmax(10px, 1fr));`
  );
</script>

{#if bars.length === 0}
  <p class="text-sm text-[var(--color-muted)]">
    No project is booked in this window. Allocate people on a project to see it here.
  </p>
{:else}
  <div class="overflow-x-auto">
    <div class="min-w-[720px]">
      <!-- Month band, aligned to the same columns the bars are measured against -->
      <div class="grid gap-0 pb-1" style={GRID}>
        <div></div>
        {#each monthSpans as m (m.key)}
          <div
            class="truncate border-l border-[var(--color-border)] pl-1 text-xs font-medium text-[var(--color-subtle)]"
            style="grid-column: span {m.span}"
          >{m.label}</div>
        {/each}
      </div>

      <div class="flex flex-col gap-1">
        {#each bars as bar (bar.projectId)}
          {@const g = geometry(bar)}
          {@const fill = projectFill(bar.projectId)}
          <div class="grid items-center gap-0" style={GRID}>
            <div class="min-w-0 pr-3">
              <a
                href="/projects/{bar.projectId}"
                class="flex items-center gap-1.5 text-sm hover:underline"
              >
                <span class="size-2 shrink-0 rounded-full" style="background: {projectSwatch(bar.projectId)}"></span>
                <span class="truncate">{bar.projectName}</span>
              </a>
              <div class="truncate pl-3.5 text-xs text-[var(--color-subtle)]">
                {formatHours(bar.minutesPerWeek)}/wk · {bar.people.map((p) => p.name).join(', ')}
              </div>
            </div>

            <!-- The track spans every week column -->
            <div class="track" style="grid-column: 2 / -1">
              {#each weeks as w, i (w.key)}
                {#if i > 0 && startsMonth(w)}
                  <span class="month-rule" style="left: {(i / weeks.length) * 100}%"></span>
                {/if}
              {/each}
              {#if nowPct !== null}
                <span class="now" style="left: {nowPct}%"></span>
              {/if}
              <a
                href="/projects/{bar.projectId}"
                class="bar"
                class:clip-start={g.clippedStart}
                class:clip-end={g.clippedEnd}
                style="left: {g.left}%; width: {g.width}%; border-color: {fill.border}; background: {fill.bg};"
                title="{bar.projectName} — {formatHours(bar.minutesPerWeek)}/wk"
              >
                <span class="bar-label">{formatHours(bar.minutesPerWeek)}/wk</span>
              </a>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .track {
    position: relative;
    height: 2.25rem;
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
  }
  .month-rule {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--color-border);
  }
  /* Today, so a bar's position is legible without counting columns. */
  .now {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    background: var(--color-interactive);
    opacity: 0.55;
    border-radius: 1px;
  }
  .bar {
    position: absolute;
    top: 4px;
    bottom: 4px;
    display: flex;
    align-items: center;
    padding: 0 0.375rem;
    border-radius: var(--radius-sm);
    border: 1px solid;
    overflow: hidden;
    transition: opacity 120ms;
  }
  .bar:hover {
    opacity: 0.85;
  }
  /* A square edge means "continues beyond this window"; a rounded one is a
     real boundary. */
  .clip-start {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left-style: dashed;
  }
  .clip-end {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right-style: dashed;
  }
  .bar-label {
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
