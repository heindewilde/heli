<script lang="ts">
  /**
   * Three questions, three views, one window control.
   *
   * - **Capacity** — people × weeks. "Who is free, and when?"
   * - **Week** — one week, day by day. "What am I doing on Tuesday?"
   * - **Projects** — engagements on a timeline. "What is running in November?"
   *
   * The header is a fixed block: title, a summary of the window, then the
   * controls. Previously the page opened straight onto a grid with a date
   * control floating beside the heading and nothing establishing what was being
   * looked at — it read as a widget dropped on a page rather than a screen.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { APP_NAME } from '$lib/branding';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Select from '$lib/ui/Select.svelte';
  import SegmentedControl from '$lib/ui/SegmentedControl.svelte';
  import { registerCommands } from '$lib/commands/registry.svelte';
  import { formatHours } from '$lib/duration';
  import { weekLabel, monthLabel, startsMonth, MS_PER_WEEK } from '$lib/weeks';
  import CapacityCell from './CapacityCell.svelte';
  import WeekView from './WeekView.svelte';
  import TimelineView from './TimelineView.svelte';

  let { data } = $props();

  const WEEK_CHOICES = [12, 26, 52];

  function buildUrl(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams(page.url.searchParams);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/availability?${s}` : '/availability';
  }

  const toIso = (ts: number) => new Date(ts).toISOString().slice(0, 10);

  /** The week view steps a week at a time; the others step a whole window. */
  const stride = $derived(data.view === 'week' ? 1 : data.weekCount);

  function shift(weeks: number) {
    goto(buildUrl({ from: toIso(data.from + weeks * MS_PER_WEEK) }), { noScroll: true });
  }

  const segments = $derived([
    { value: 'grid', label: 'Capacity', href: buildUrl({ view: null }) },
    { value: 'week', label: 'Week', href: buildUrl({ view: 'week' }) },
    { value: 'projects', label: 'Projects', href: buildUrl({ view: 'projects' }) }
  ]);

  /** What the window covers, in words — the header's subject line. */
  const rangeLabel = $derived.by(() => {
    if (data.view === 'week') {
      const end = data.from + 6 * 86_400_000;
      return `${weekLabel(data.from)} – ${weekLabel(end)}`;
    }
    const end = data.from + (data.weekCount - 1) * MS_PER_WEEK;
    return `${monthLabel(data.from)} – ${monthLabel(end)}`;
  });

  // ----- Capacity view derived state ---------------------------------------
  const win = $derived(data.window);

  const GRID = $derived(
    `grid-template-columns: 180px repeat(${Math.max(1, win?.weeks.length ?? 1)}, minmax(46px, 1fr));`
  );

  const monthSpans = $derived.by(() => {
    const out: { key: string; label: string; span: number }[] = [];
    for (const w of win?.weeks ?? []) {
      const label = monthLabel(w.start);
      const last = out[out.length - 1];
      if (last && last.label === label) last.span += 1;
      else out.push({ key: w.key, label, span: 1 });
    }
    return out;
  });

  const totals = $derived.by(() =>
    (win?.weeks ?? []).map((_, i) => {
      let allocated = 0;
      let capacity = 0;
      for (const row of win?.rows ?? []) {
        allocated += row.cells[i]?.allocated ?? 0;
        capacity += row.capacityMinutes;
      }
      return { allocated, free: capacity - allocated };
    })
  );

  onMount(() =>
    registerCommands([
      {
        id: 'ctx:availability-next',
        title: 'Next period',
        section: 'This page',
        shortcut: ']',
        run: () => shift(stride)
      },
      {
        id: 'ctx:availability-prev',
        title: 'Previous period',
        section: 'This page',
        shortcut: '[',
        run: () => shift(-stride)
      },
      {
        id: 'ctx:availability-today',
        title: 'Back to this week',
        section: 'This page',
        run: () => goto(buildUrl({ from: null }), { noScroll: true })
      }
    ])
  );
</script>

<svelte:head>
  <title>Availability — {APP_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-5">
  <header class="flex flex-col gap-4">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">Availability</h1>
      <span class="text-sm text-[var(--color-muted)]">{rangeLabel}</span>
    </div>

    <!-- Controls -->
    <div class="flex flex-wrap items-center gap-2">
      <SegmentedControl segments={segments} value={data.view} label="Availability view" />

      <div class="ml-auto flex items-center gap-2">
        <div class="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)] p-0.5">
          <Button variant="ghost" size="sm" onclick={() => shift(-stride)} aria-label="Previous period">
            <ChevronLeft size={14} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onclick={() => goto(buildUrl({ from: null }), { noScroll: true })}
          >Today</Button>
          <Button variant="ghost" size="sm" onclick={() => shift(stride)} aria-label="Next period">
            <ChevronRight size={14} strokeWidth={2} />
          </Button>
        </div>

        {#if data.view !== 'week'}
          <Select
            size="md"
            label="Horizon"
            value={String(data.weekCount)}
            options={WEEK_CHOICES.map((n) => ({ value: String(n), label: `${n} weeks` }))}
            onchange={(weeks) => goto(buildUrl({ weeks }), { noScroll: true, keepFocus: true })}
          />
        {/if}
      </div>
    </div>
  </header>

  {#if data.view === 'week' && data.week}
    <WeekView detail={data.week} />
  {:else if data.view === 'projects' && data.timeline}
    <TimelineView weeks={data.timeline.weeks} bars={data.timeline.bars} />
  {:else if win}
    {#if win.rows.length === 0}
      <EmptyState
        icon={CalendarRange}
        title="Nobody to plan for yet"
        description="Availability is built from the people in your workspace and the projects they are booked on."
      >
        {#snippet actions()}<Button href="/projects" variant="secondary">Go to projects</Button>{/snippet}
      </EmptyState>
    {:else}
      <!-- Wide boards scroll inside their own container; the page never scrolls
           horizontally. -->
      <div class="overflow-x-auto pb-1">
        <div class="min-w-[720px]">
          <div class="grid gap-1 pb-1" style={GRID}>
            <div></div>
            {#each monthSpans as m (m.key)}
              <div
                class="truncate text-xs font-medium text-[var(--color-subtle)]"
                style="grid-column: span {m.span}"
              >{m.label}</div>
            {/each}
          </div>

          <div class="grid gap-1 pb-2" style={GRID}>
            <div class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">
              Person
            </div>
            {#each win.weeks as w (w.key)}
              <div class="truncate text-center text-[0.6875rem] text-[var(--color-subtle)]">
                {weekLabel(w.start)}
              </div>
            {/each}
          </div>

          <div class="flex flex-col gap-1">
            {#each win.rows as row (row.userId)}
              <div class="grid items-center gap-1" style={GRID}>
                <div class="min-w-0 pr-2">
                  <div class="truncate text-sm">{row.name}</div>
                  <div class="truncate text-xs text-[var(--color-subtle)]">
                    {formatHours(row.capacityMinutes)}/wk{row.capacityIsExplicit ? '' : ' (default)'}
                  </div>
                </div>
                {#each win.weeks as w, i (w.key)}
                  <CapacityCell
                    cell={row.cells[i]}
                    capacityMinutes={row.capacityMinutes}
                    memberName={row.name}
                    weekLabel={weekLabel(w.start)}
                    weekStartsAt={w.start}
                    monthBoundary={i > 0 && startsMonth(w)}
                  />
                {/each}
              </div>
            {/each}
          </div>

          <div
            class="mt-2 grid items-center gap-1 border-t border-[var(--color-border)] pt-2"
            style={GRID}
          >
            <div class="text-xs font-medium text-[var(--color-muted)]">Free, all in</div>
            {#each totals as t, i (win.weeks[i].key)}
              <div
                class="text-center text-[0.6875rem] tabular-nums {t.free < 0
                  ? 'font-semibold text-[var(--color-danger)]'
                  : 'text-[var(--color-muted)]'}"
              >
                {t.free < 0 ? `−${formatHours(-t.free)}` : formatHours(t.free)}
              </div>
            {/each}
          </div>
        </div>
      </div>

      <p class="text-xs text-[var(--color-muted)]">
        Free hours a week, from the projects people are booked on. Set someone's working week in
        <a href="/settings#team" class="underline">Settings → Team</a>.
      </p>
    {/if}
  {/if}
</div>
