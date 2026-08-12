<script lang="ts">
  /**
   * Tracked time.
   *
   * The old version stacked timer, filters, an add button and a flat list at
   * one visual weight, so nothing said what the screen was for. The order now
   * follows what you actually do: **start the clock**, then **see the shape of
   * the range**, then **read the days**.
   *
   * The timer bar is sticky. It is the only control on the page you reach for
   * without reading anything else, and scrolling a week of entries used to
   * leave it behind.
   */
  import { onMount } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import {
    Timer,
    Plus,
    ChevronLeft,
    ChevronRight,
    CalendarDays,
    Filter,
    CircleDollarSign
  } from 'lucide-svelte';
  import { APP_NAME } from '$lib/branding';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Select from '$lib/ui/Select.svelte';
  import SegmentedControl from '$lib/ui/SegmentedControl.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { registerCommands } from '$lib/commands/registry.svelte';
  import { formatMinutes, parseDuration } from '$lib/duration';
  import { dayBucket } from '$lib/interactions';
  import { MS_PER_WEEK, MS_PER_DAY, weekStart } from '$lib/weeks';
  import TimerBar from './TimerBar.svelte';
  import EntryRow from './EntryRow.svelte';
  import WeekStrip from './WeekStrip.svelte';
  import TimeReport from './TimeReport.svelte';

  let { data } = $props();

  const showWho = $derived(data.filters.userId === 'all');

  function buildUrl(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams(page.url.searchParams);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/time?${s}` : '/time';
  }

  const toIso = (ts: number) => new Date(ts).toISOString().slice(0, 10);
  const go = (o: Record<string, string | null>) =>
    goto(buildUrl(o), { noScroll: true, keepFocus: true });

  /** Range presets. Typing two dates to answer "last month" is a chore. */
  const PRESETS = [
    { value: 'this-week', label: 'This week' },
    { value: 'last-week', label: 'Last week' },
    { value: 'this-month', label: 'This month' },
    { value: 'last-month', label: 'Last month' },
    { value: 'this-quarter', label: 'This quarter' },
    { value: 'custom', label: 'Custom range' }
  ];

  function presetRange(v: string): { from: number; to: number } | null {
    const now = new Date();
    const monthStart = (offset: number) =>
      new Date(now.getFullYear(), now.getMonth() + offset, 1).getTime();
    switch (v) {
      case 'this-week':
        return { from: weekStart(Date.now()), to: weekStart(Date.now()) + MS_PER_WEEK - MS_PER_DAY };
      case 'last-week':
        return {
          from: weekStart(Date.now()) - MS_PER_WEEK,
          to: weekStart(Date.now()) - MS_PER_DAY
        };
      case 'this-month':
        return { from: monthStart(0), to: monthStart(1) - MS_PER_DAY };
      case 'last-month':
        return { from: monthStart(-1), to: monthStart(0) - MS_PER_DAY };
      case 'this-quarter': {
        const q = Math.floor(now.getMonth() / 3) * 3;
        return {
          from: new Date(now.getFullYear(), q, 1).getTime(),
          to: new Date(now.getFullYear(), q + 3, 1).getTime() - MS_PER_DAY
        };
      }
      default:
        return null;
    }
  }

  /** Which preset the current range corresponds to, if any. */
  const activePreset = $derived.by(() => {
    for (const p of PRESETS) {
      const r = presetRange(p.value);
      if (!r) continue;
      if (toIso(r.from) === toIso(data.filters.from) && toIso(r.to) === toIso(data.filters.to)) {
        return p.value;
      }
    }
    return 'custom';
  });

  function applyPreset(v: string) {
    const r = presetRange(v);
    if (!r) return;
    go({ from: toIso(r.from), to: toIso(r.to) });
  }

  function shiftRange(dir: number) {
    const span = data.filters.to - data.filters.from + MS_PER_DAY;
    go({
      from: toIso(data.filters.from + dir * span),
      to: toIso(data.filters.to + dir * span)
    });
  }

  // ----- Day grouping -------------------------------------------------------
  const startOfDay = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  /** Set by the week strip; narrows the rendered list without a round trip. */
  let dayFilter = $state<number | null>(null);
  $effect(() => {
    // A new range invalidates a day selection from the previous one.
    void data.filters.from;
    dayFilter = null;
  });

  const visibleEntries = $derived(
    dayFilter === null
      ? data.entries
      : data.entries.filter((e) => startOfDay(e.startedAt) === dayFilter)
  );

  const days = $derived.by(() => {
    const today = new Date();
    const map = new Map<
      string,
      { label: string; items: typeof data.entries; minutes: number; billable: number }
    >();
    for (const e of visibleEntries) {
      const b = dayBucket(e.startedAt, today);
      const mins = e.endedAt == null ? 0 : Math.round((e.endedAt - e.startedAt) / 60_000);
      const g = map.get(b.key);
      if (g) {
        g.items.push(e);
        g.minutes += mins;
        if (e.billable) g.billable += mins;
      } else {
        map.set(b.key, {
          label: b.label,
          items: [e],
          minutes: mins,
          billable: e.billable ? mins : 0
        });
      }
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  });

  const rangeMinutes = $derived(
    data.entries.reduce(
      (n, e) => n + (e.endedAt == null ? 0 : Math.round((e.endedAt - e.startedAt) / 60_000)),
      0
    )
  );

  /**
   * The CSV carries the *report's* filters, not the whole workspace — an export
   * button under a filtered report that quietly exported everything else would
   * be worse than no button.
   */
  const csvHref = $derived.by(() => {
    const p = new URLSearchParams({ kind: 'time' });
    p.set('from', String(data.filters.from));
    p.set('to', String(data.filters.to + MS_PER_DAY));
    if (data.filters.projectId) p.set('project', data.filters.projectId);
    if (data.filters.billable) p.set('billable', data.filters.billable);
    p.set('user', data.filters.userId === 'me' ? 'me' : data.filters.userId);
    return `/api/export?${p}`;
  });

  /** Past a month the per-day strip stops being legible. */
  const stripDays = $derived(
    Math.round((startOfDay(data.filters.to) - startOfDay(data.filters.from)) / MS_PER_DAY) + 1
  );
  const showStrip = $derived(stripDays > 1 && stripDays <= 31);

  // ----- Manual add ---------------------------------------------------------
  let adding = $state(false);
  let mDate = $state('');
  let mDuration = $state('');
  let mDescription = $state('');
  let mProject = $state('');
  let saving = $state(false);

  function startAdd() {
    adding = true;
    mDate = toIso(dayFilter ?? Date.now());
    mDuration = '';
    mDescription = '';
    mProject = '';
  }

  async function submitAdd() {
    const minutes = parseDuration(mDuration);
    if (minutes == null || minutes <= 0) {
      toast.danger('Enter a duration — 1:30, 1.5h or 90m');
      return;
    }
    const day = Date.parse(mDate);
    if (!Number.isFinite(day)) {
      toast.danger('Pick a date');
      return;
    }
    saving = true;
    try {
      // 09:00 local on the chosen day: a backfilled entry has no real clock
      // time, and midnight would make it look like night work.
      const start = new Date(day);
      start.setHours(9, 0, 0, 0);
      const res = await fetch('/api/time', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startedAt: start.getTime(),
          minutes,
          description: mDescription.trim() || null,
          projectId: mProject || null
        })
      });
      if (!res.ok) throw new Error();
      adding = false;
      await invalidateAll();
    } catch {
      toast.danger('Could not add that entry');
    } finally {
      saving = false;
    }
  }

  onMount(() =>
    registerCommands([
      {
        id: 'ctx:time-add',
        title: 'Add a time entry',
        section: 'This page',
        shortcut: 'a',
        run: startAdd
      },
      {
        id: 'ctx:time-prev',
        title: 'Previous period',
        section: 'This page',
        shortcut: '[',
        run: () => shiftRange(-1)
      },
      {
        id: 'ctx:time-next',
        title: 'Next period',
        section: 'This page',
        shortcut: ']',
        run: () => shiftRange(1)
      }
    ])
  );

  const fieldClass =
    'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm';
</script>

<svelte:head>
  <title>Time — {APP_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <h1 class="text-2xl font-semibold tracking-tight">Time</h1>
    <span class="text-sm tabular-nums text-[var(--color-muted)]">
      {formatMinutes(rangeMinutes)} in range
    </span>
    <div class="ml-auto">
      <SegmentedControl
        label="Time view"
        value={data.view}
        segments={[
          { value: 'entries', label: 'Entries', href: buildUrl({ view: null }) },
          { value: 'report', label: 'Report', href: buildUrl({ view: 'report' }) }
        ]}
      />
    </div>
  </header>

  <!-- Sticky: the one control you reach for without reading the page. -->
  <div class="sticky top-0 z-[var(--z-sticky)] -mx-1 bg-[var(--color-bg)] px-1 pb-2 pt-1">
    <TimerBar running={data.running} projects={data.projects} />
  </div>

  <!--
    One toolbar, not seven floating controls. **When** on the left, **which**
    on the right, a rule between them: the two are different questions and
    laying them out at one weight was most of why the page was hard to read.
  -->
  <div class="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2">
    <CalendarDays size={14} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
    <Select
      size="sm"
      label="Date range"
      value={activePreset}
      options={PRESETS}
      onchange={applyPreset}
    />
    <div class="flex items-center gap-0.5">
      <Button variant="ghost" size="sm" onclick={() => shiftRange(-1)} aria-label="Previous period">
        <ChevronLeft size={14} strokeWidth={2} />
      </Button>
      <Button variant="ghost" size="sm" onclick={() => shiftRange(1)} aria-label="Next period">
        <ChevronRight size={14} strokeWidth={2} />
      </Button>
    </div>
    <input
      type="date"
      value={toIso(data.filters.from)}
      onchange={(e) => go({ from: e.currentTarget.value })}
      aria-label="From"
      class={fieldClass}
    />
    <span class="text-xs text-[var(--color-subtle)]">to</span>
    <input
      type="date"
      value={toIso(data.filters.to)}
      onchange={(e) => go({ to: e.currentTarget.value })}
      aria-label="To"
      class={fieldClass}
    />

    <span class="mx-1 hidden h-6 w-px bg-[var(--color-border)] sm:block"></span>

    <div class="flex flex-wrap items-center gap-2">
      <Filter size={14} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
      <Select
        size="sm"
        label="Person"
        value={data.filters.userId}
        options={[
          { value: 'me', label: 'Me' },
          { value: 'all', label: 'Everyone' },
          ...data.members.map((m) => ({ value: m.userId, label: m.name }))
        ]}
        onchange={(user) => go({ user })}
      />
      <Select
        size="sm"
        label="Project filter"
        value={data.filters.projectId}
        options={[
          { value: '', label: 'All projects' },
          ...data.projects.map((p) => ({ value: p.id, label: p.name }))
        ]}
        onchange={(project) => go({ project })}
      />
      <Select
        size="sm"
        label="Billable filter"
        value={data.filters.billable}
        options={[
          { value: '', label: 'Billable & not' },
          { value: '1', label: 'Billable only' },
          { value: '0', label: 'Non-billable only' }
        ]}
        onchange={(billable) => go({ billable })}
      />
    </div>
  </div>

  {#if data.view === 'report'}
    <TimeReport
      summary={data.summary}
      filters={data.filters}
      csvHref={csvHref}
      onGroupBy={(group) => go({ group })}
      onRoundTo={(round) => go({ round: round === '0' ? null : round })}
    />
  {:else}
    {#if showStrip}
      <WeekStrip
        entries={data.entries}
        from={data.filters.from}
        to={data.filters.to}
        capacityMinutes={data.capacityMinutes}
        activeDay={dayFilter}
        onPickDay={(d) => (dayFilter = d)}
      />
    {/if}

    {#if adding}
      <div class="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <label class="flex flex-col gap-1 text-xs">
          <span class="text-[var(--color-muted)]">Day</span>
          <input type="date" bind:value={mDate} class={fieldClass} />
        </label>
        <label class="flex min-w-40 flex-1 flex-col gap-1 text-xs">
          <span class="text-[var(--color-muted)]">What</span>
          <input bind:value={mDescription} placeholder="Description" class="w-full {fieldClass}" />
        </label>
        <div class="flex flex-col gap-1 text-xs">
          <span class="text-[var(--color-muted)]">Project</span>
          <Select
            size="md"
            label="Project"
            bind:value={mProject}
            options={[
              { value: '', label: 'No project' },
              ...data.projects.map((p) => ({ value: p.id, label: p.name }))
            ]}
          />
        </div>
        <label class="flex flex-col gap-1 text-xs">
          <span class="text-[var(--color-muted)]">How long</span>
          <input
            bind:value={mDuration}
            placeholder="1:30"
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(); } }}
            class="w-24 text-right tabular-nums {fieldClass}"
          />
        </label>
        <div class="flex items-center gap-1">
          <Button size="sm" onclick={submitAdd} loading={saving}>Add</Button>
          <Button size="sm" variant="ghost" onclick={() => (adding = false)}>Cancel</Button>
        </div>
      </div>
    {/if}

    {#if visibleEntries.length === 0}
      <EmptyState
        icon={Timer}
        title={dayFilter === null ? 'No time tracked here' : 'Nothing on that day'}
        description="Start the timer above, or add an entry for a day you forgot."
      >
        {#snippet actions()}
          <Button variant="secondary" onclick={startAdd}>Add time manually</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <!--
        Each day is its own card. A shared border and a heading were not enough
        containment — with four days on screen the rows ran together and it was
        genuinely unclear which total belonged to which group.
      -->
      <div class="flex flex-col gap-3">
        {#each days as [key, day] (key)}
          <section class="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div class="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
              <h2 class="text-sm font-semibold text-[var(--color-text)]">{day.label}</h2>
              <span class="flex items-center gap-2 text-xs tabular-nums">
                {#if day.billable > 0}
                  <span
                    class="inline-flex items-center gap-1 rounded-full border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-1.5 py-0.5 text-[var(--color-success)]"
                  >
                    <CircleDollarSign size={11} strokeWidth={2} />
                    {formatMinutes(day.billable)}
                  </span>
                {/if}
                <span class="font-medium text-[var(--color-text)]">{formatMinutes(day.minutes)}</span>
              </span>
            </div>
            <div class="flex flex-col divide-y divide-[var(--color-border)] px-1.5 py-1">
              {#each day.items as entry (entry.id)}
                <EntryRow
                  {entry}
                  projects={data.projects}
                  {showWho}
                  onChanged={() => invalidateAll()}
                  onRemoved={() => invalidateAll()}
                />
              {/each}
            </div>
          </section>
        {/each}
      </div>

      {#if !adding}
        <button
          type="button"
          onclick={startAdd}
          class="inline-flex items-center gap-1 self-start rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-muted)] hover:border-[var(--color-highlight-border)] hover:bg-[var(--color-highlight-bg)] hover:text-[var(--color-text)]"
        >
          <Plus size={12} strokeWidth={2} />
          Add time manually
        </button>
      {/if}
    {/if}
  {/if}
</div>
