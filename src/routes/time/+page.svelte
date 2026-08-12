<script lang="ts">
  /**
   * Tracked time: a timer, the entries it produces, and the rollup you invoice
   * from. One route with a segmented control rather than two — the report is
   * the same filtered data grouped differently.
   */
  import { onMount } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { Timer, Plus } from 'lucide-svelte';
  import { APP_NAME } from '$lib/branding';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Select from '$lib/ui/Select.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { registerCommands } from '$lib/commands/registry.svelte';
  import { formatMinutes, parseDuration } from '$lib/duration';
  import { dayBucket } from '$lib/interactions';
  import { MS_PER_WEEK, weekStart } from '$lib/weeks';
  import TimerBar from './TimerBar.svelte';
  import EntryRow from './EntryRow.svelte';

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

  function shiftWeek(by: number) {
    const from = weekStart(data.filters.from) + by * MS_PER_WEEK;
    go({ from: toIso(from), to: toIso(from + MS_PER_WEEK - 86_400_000) });
  }

  /** Days, newest first, using the same bucketing the activity feed uses. */
  const days = $derived.by(() => {
    const today = new Date();
    const map = new Map<string, { label: string; items: typeof data.entries; minutes: number }>();
    for (const e of data.entries) {
      const b = dayBucket(e.startedAt, today);
      const mins = e.endedAt == null ? 0 : Math.round((e.endedAt - e.startedAt) / 60_000);
      const g = map.get(b.key);
      if (g) {
        g.items.push(e);
        g.minutes += mins;
      } else {
        map.set(b.key, { label: b.label, items: [e], minutes: mins });
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

  // ----- Manual add ---------------------------------------------------------
  let adding = $state(false);
  let mDate = $state('');
  let mDuration = $state('');
  let mDescription = $state('');
  let mProject = $state('');
  let saving = $state(false);

  function startAdd() {
    adding = true;
    mDate = toIso(Date.now());
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
      // time, and putting it at midnight makes it look like night work.
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

  const money = (cents: number, currency: string) => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`;
    }
  };

  /** Widest group drives the bar scale, the Histogram technique. */
  const maxGroupMinutes = $derived(
    Math.max(1, ...(data.summary?.groups ?? []).map((g) => g.minutes))
  );

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
        id: 'ctx:time-prev-week',
        title: 'Previous week',
        section: 'This page',
        shortcut: '[',
        run: () => shiftWeek(-1)
      },
      {
        id: 'ctx:time-next-week',
        title: 'Next week',
        section: 'This page',
        shortcut: ']',
        run: () => shiftWeek(1)
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
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">Time</h1>
    <span class="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs tabular-nums text-[var(--color-muted)]">
      {formatMinutes(rangeMinutes)}
    </span>
    <div class="ml-auto flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] p-0.5">
      <a
        href={buildUrl({ view: null })}
        class="rounded-[var(--radius-sm)] px-3 py-1 text-sm {data.view === 'entries'
          ? 'bg-[var(--color-surface)] font-medium text-[var(--color-text)]'
          : 'text-[var(--color-muted)]'}"
      >Entries</a>
      <a
        href={buildUrl({ view: 'report' })}
        class="rounded-[var(--radius-sm)] px-3 py-1 text-sm {data.view === 'report'
          ? 'bg-[var(--color-surface)] font-medium text-[var(--color-text)]'
          : 'text-[var(--color-muted)]'}"
      >Report</a>
    </div>
  </header>

  <TimerBar running={data.running} projects={data.projects} />

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-2 text-xs">
    <Button variant="ghost" size="sm" onclick={() => shiftWeek(-1)}>←</Button>
    <input
      type="date"
      value={toIso(data.filters.from)}
      onchange={(e) => go({ from: e.currentTarget.value })}
      aria-label="From"
      class={fieldClass}
    />
    <span class="text-[var(--color-subtle)]">to</span>
    <input
      type="date"
      value={toIso(data.filters.to)}
      onchange={(e) => go({ to: e.currentTarget.value })}
      aria-label="To"
      class={fieldClass}
    />
    <Button variant="ghost" size="sm" onclick={() => shiftWeek(1)}>→</Button>

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

  {#if data.view === 'report'}
    {#if !data.summary || data.summary.groups.length === 0}
      <EmptyState
        icon={Timer}
        title="Nothing tracked in this range"
        description="Widen the dates, or start the timer above."
      />
    {:else}
      <div class="flex flex-wrap gap-6 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div>
          <div class="text-xs uppercase tracking-wide text-[var(--color-subtle)]">Tracked</div>
          <div class="text-xl tabular-nums">{formatMinutes(data.summary.totalMinutes)}</div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-wide text-[var(--color-subtle)]">Billable</div>
          <div class="text-xl tabular-nums">{formatMinutes(data.summary.billableMinutes)}</div>
        </div>
        {#each Object.entries(data.summary.amountByCurrency) as [cur, cents] (cur)}
          <div>
            <div class="text-xs uppercase tracking-wide text-[var(--color-subtle)]">Amount</div>
            <div class="text-xl tabular-nums">{money(cents, cur)}</div>
          </div>
        {/each}
      </div>

      <ul class="flex flex-col gap-2">
        {#each data.summary.groups as g (g.projectId ?? 'none')}
          <li class="grid items-center gap-3" style="grid-template-columns: minmax(0,1fr) 1fr 90px 110px;">
            <span class="truncate text-sm">
              {#if g.projectId}
                <a href="/projects/{g.projectId}" class="hover:underline">{g.projectName}</a>
              {:else}
                <span class="italic text-[var(--color-muted)]">No project</span>
              {/if}
            </span>
            <span class="track"><span class="fill" style="--p: {(g.minutes / maxGroupMinutes) * 100}%"></span></span>
            <span class="text-right text-sm tabular-nums">{formatMinutes(g.minutes)}</span>
            <span class="text-right text-sm tabular-nums text-[var(--color-muted)]">
              {g.amount > 0 ? money(g.amount, g.currency ?? '') : '—'}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <!-- Manual add -->
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
        <label class="flex flex-col gap-1 text-xs">
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
        </label>
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
    {:else}
      <button
        type="button"
        onclick={startAdd}
        class="inline-flex items-center gap-1 self-start rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-highlight-border)] hover:bg-[var(--color-highlight-bg)] hover:text-[var(--color-text)]"
      >
        <Plus size={12} strokeWidth={2} />
        Add time manually
      </button>
    {/if}

    {#if data.entries.length === 0}
      <EmptyState
        icon={Timer}
        title="No time tracked here"
        description="Start the timer above, or add an entry for a day you forgot."
      />
    {:else}
      <div class="flex flex-col gap-4">
        {#each days as [key, day] (key)}
          <section class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <h2 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">
                {day.label}
              </h2>
              <span class="text-xs tabular-nums text-[var(--color-muted)]">
                {formatMinutes(day.minutes)}
              </span>
            </div>
            {#each day.items as entry (entry.id)}
              <EntryRow
                {entry}
                projects={data.projects}
                {showWho}
                onChanged={() => invalidateAll()}
                onRemoved={() => invalidateAll()}
              />
            {/each}
          </section>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .track {
    height: 8px;
    border-radius: 999px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    width: var(--p);
    background: var(--color-accent);
  }
</style>
