<script lang="ts">
  /**
   * People × weeks. Read a row to see when someone frees up; read a column to
   * see whether next month is sellable.
   *
   * Pure CSS grid — one template string used by the month band, the header and
   * every row, so a column added to one cannot misalign the others. That is the
   * house rule from the list pages (`GRID` / `ROW_GRID`).
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { APP_NAME } from '$lib/branding';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Select from '$lib/ui/Select.svelte';
  import { registerCommands } from '$lib/commands/registry.svelte';
  import { formatHours } from '$lib/duration';
  import { weekLabel, monthLabel, startsMonth, MS_PER_WEEK } from '$lib/weeks';
  import CapacityCell from './CapacityCell.svelte';

  let { data } = $props();
  const win = $derived(data.window);

  /** One definition, used by the month band, the header row and every data row. */
  const GRID = $derived(
    `grid-template-columns: 180px repeat(${Math.max(1, win.weeks.length)}, minmax(46px, 1fr));`
  );

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

  function shift(weeks: number) {
    goto(buildUrl({ from: toIso(win.from + weeks * MS_PER_WEEK) }), { noScroll: true });
  }

  /**
   * The month band: one label per run of weeks in the same month, so the header
   * reads "Feb  Mar  Apr" rather than repeating the month over every column.
   */
  const monthSpans = $derived.by(() => {
    const out: { key: string; label: string; span: number }[] = [];
    for (const w of win.weeks) {
      const label = monthLabel(w.start);
      const last = out[out.length - 1];
      if (last && last.label === label) last.span += 1;
      else out.push({ key: w.key, label, span: 1 });
    }
    return out;
  });

  /** Workspace totals per week — the bottom line of the board. */
  const totals = $derived.by(() =>
    win.weeks.map((_, i) => {
      let allocated = 0;
      let capacity = 0;
      for (const row of win.rows) {
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
        run: () => shift(win.weekCount)
      },
      {
        id: 'ctx:availability-prev',
        title: 'Previous period',
        section: 'This page',
        shortcut: '[',
        run: () => shift(-win.weekCount)
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

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">Availability</h1>
    <div class="ml-auto flex items-center gap-2">
      <div class="flex items-center gap-1">
        <Button variant="ghost" size="sm" onclick={() => shift(-win.weekCount)} aria-label="Previous period">
          <ChevronLeft size={14} strokeWidth={2} />
        </Button>
        <Button variant="ghost" size="sm" onclick={() => goto(buildUrl({ from: null }), { noScroll: true })}>
          Today
        </Button>
        <Button variant="ghost" size="sm" onclick={() => shift(win.weekCount)} aria-label="Next period">
          <ChevronRight size={14} strokeWidth={2} />
        </Button>
      </div>
      <Select
        size="md"
        label="Horizon"
        value={String(win.weekCount)}
        options={WEEK_CHOICES.map((n) => ({ value: String(n), label: `${n} weeks` }))}
        onchange={(weeks) => goto(buildUrl({ weeks }), { noScroll: true, keepFocus: true })}
      />
    </div>
  </header>

  <p class="text-sm text-[var(--color-muted)]">
    Free hours a week, from the projects people are booked on. Set someone's working week in
    <a href="/settings#team" class="underline">Settings → Team</a>.
  </p>

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
    <div class="overflow-x-auto pb-2">
      <div class="min-w-[720px]">
        <!-- Month band -->
        <div class="grid gap-1 pb-1" style={GRID}>
          <div></div>
          {#each monthSpans as m (m.key)}
            <div
              class="truncate text-xs font-medium text-[var(--color-subtle)]"
              style="grid-column: span {m.span}"
            >{m.label}</div>
          {/each}
        </div>

        <!-- Week header -->
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

        <!-- Rows -->
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
                  monthBoundary={i > 0 && startsMonth(w)}
                />
              {/each}
            </div>
          {/each}
        </div>

        <!-- Workspace total -->
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
  {/if}
</div>
