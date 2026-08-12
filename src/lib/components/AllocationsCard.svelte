<script lang="ts">
  /**
   * Who is booked on this project, for which weeks, at how many hours.
   *
   * The only place allocations are created. Hours are entered in hours and
   * stored as minutes — the conversion happens here so nothing downstream has
   * to think about it.
   *
   * Optimistic-with-rollback, like the other project cards.
   */
  import { Users, X, Pencil, Check } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Select from '$lib/ui/Select.svelte';
  import { formatHours, hoursToMinutes, minutesToHours } from '$lib/duration';
  import { DAY_NAMES, WEEKDAY_MASK, countDays, describeDays, hasDay, toggleDay } from '$lib/weeks';
  import type { AllocationRow, MemberCapacity } from '$lib/server/allocations';

  type Props = {
    projectId: string;
    allocations: AllocationRow[];
    members: MemberCapacity[];
    /** Seeds the date fields so the common case needs no typing. */
    projectStart: number | null;
    projectEnd: number | null;
  };

  let { projectId, allocations: initial, members, projectStart, projectEnd }: Props = $props();

  // svelte-ignore state_referenced_locally
  let items = $state<AllocationRow[]>([...initial]);
  $effect(() => {
    items = [...initial];
  });

  const endpoint = $derived(`/api/projects/${projectId}/allocations`);

  let adding = $state(false);
  let saving = $state(false);
  let editingId = $state<string | null>(null);

  // Draft fields, shared by the add and edit forms.
  let dAssignee = $state('');
  let dStart = $state('');
  let dEnd = $state('');
  let dHours = $state('');
  /** 0 means "no particular days" and is stored as NULL. */
  let dDays = $state(0);

  function toDateInput(ts: number | null): string {
    if (!ts) return '';
    return new Date(ts).toISOString().slice(0, 10);
  }
  function fromDateInput(v: string): number | null {
    if (!v) return null;
    const ts = Date.parse(v);
    return Number.isFinite(ts) ? ts : null;
  }

  function startAdd() {
    adding = true;
    editingId = null;
    dAssignee = members[0]?.userId ?? '';
    // Default to the project's own dates — that is the answer most of the time.
    dStart = toDateInput(projectStart);
    dEnd = toDateInput(projectEnd);
    dHours = '';
    dDays = 0;
  }

  function startEdit(a: AllocationRow) {
    editingId = a.id;
    adding = false;
    dAssignee = a.assigneeUserId;
    dStart = toDateInput(a.startDate);
    dEnd = toDateInput(a.endDate);
    dHours = String(minutesToHours(a.minutesPerWeek));
    dDays = a.dayMask ?? 0;
  }

  function cancel() {
    adding = false;
    editingId = null;
  }

  /** Shared validation so the add and edit paths cannot disagree. */
  function readDraft(): {
    assigneeUserId: string;
    startDate: number;
    endDate: number;
    minutesPerWeek: number;
    dayMask: number | null;
  } | null {
    const startDate = fromDateInput(dStart);
    const endDate = fromDateInput(dEnd);
    const minutesPerWeek = hoursToMinutes(dHours);
    if (!dAssignee) {
      toast.danger('Pick someone to allocate');
      return null;
    }
    if (startDate == null || endDate == null) {
      toast.danger('Both dates are required');
      return null;
    }
    if (endDate < startDate) {
      toast.danger('The end date is before the start date');
      return null;
    }
    if (minutesPerWeek == null || minutesPerWeek <= 0) {
      toast.danger('Enter hours per week, e.g. 16 or 7.5');
      return null;
    }
    return {
      assigneeUserId: dAssignee,
      startDate,
      endDate,
      minutesPerWeek,
      dayMask: dDays === 0 ? null : dDays
    };
  }

  /** `8h × Tue, Thu` — what the week view will actually draw. */
  const perDayPreview = $derived.by(() => {
    const minutes = hoursToMinutes(dHours);
    if (minutes == null || dDays === 0) return null;
    return `${formatHours(Math.round(minutes / countDays(dDays)))} on each of ${countDays(dDays)} days`;
  });

  async function submitAdd() {
    const draft = readDraft();
    if (!draft || saving) return;
    saving = true;
    const member = members.find((m) => m.userId === draft.assigneeUserId);
    const tempId = `temp-${Date.now()}`;
    const optimistic: AllocationRow = {
      id: tempId,
      projectId,
      projectName: '',
      assigneeName: member?.name ?? '',
      hourlyRate: null,
      note: null,
      ...draft
    } satisfies AllocationRow;
    items = [...items, optimistic];
    cancel();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft)
      });
      if (!res.ok) throw new Error('create_failed');
      const { id } = (await res.json()) as { id: string };
      items = items.map((a) => (a.id === tempId ? { ...a, id } : a));
    } catch {
      items = items.filter((a) => a.id !== tempId);
      toast.danger('Could not save the allocation');
    } finally {
      saving = false;
    }
  }

  async function submitEdit() {
    const draft = readDraft();
    if (!draft || !editingId || saving) return;
    const id = editingId;
    saving = true;
    const before = items;
    const member = members.find((m) => m.userId === draft.assigneeUserId);
    items = items.map((a) =>
      a.id === id ? { ...a, ...draft, assigneeName: member?.name ?? a.assigneeName } : a
    );
    cancel();
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, ...draft })
    });
    saving = false;
    if (!res.ok) {
      items = before;
      toast.danger('Update failed');
    }
  }

  async function remove(a: AllocationRow) {
    if (a.id.startsWith('temp-')) return;
    const before = items;
    items = items.filter((x) => x.id !== a.id);
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: a.id })
    });
    if (!res.ok) {
      items = before;
      toast.danger('Delete failed');
    }
  }

  function rangeLabel(a: AllocationRow): string {
    const fmt = (ts: number) =>
      new Date(ts).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    return `${fmt(a.startDate)} – ${fmt(a.endDate)}`;
  }

  /**
   * The total is per week and only meaningful while allocations overlap, so it
   * is labelled "at peak" rather than presented as a flat sum.
   */
  const peakMinutes = $derived.by(() => {
    if (items.length === 0) return 0;
    // Sweep the boundaries: the peak of a set of intervals always occurs at
    // one of their start points.
    let peak = 0;
    for (const probe of items) {
      const at = probe.startDate;
      let total = 0;
      for (const a of items) {
        if (a.startDate <= at && a.endDate >= at) total += a.minutesPerWeek;
      }
      if (total > peak) peak = total;
    }
    return peak;
  });

  const fieldClass =
    'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm';
</script>

<!--
  One form for both add and edit. They were byte-identical apart from the submit
  handler and its label, which is exactly the shape that drifts — the day picker
  would otherwise have had to be added twice and kept in step by hand.
-->
{#snippet allocForm(onSubmit: () => void, submitLabel: string)}
  <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
    <div class="flex flex-wrap items-end gap-2">
      <label class="flex flex-col gap-1 text-xs">
        <span class="text-[var(--color-muted)]">Who</span>
        <Select
          label="Who"
          bind:value={dAssignee}
          options={members.map((m) => ({ value: m.userId, label: m.name }))}
        />
      </label>
      <label class="flex flex-col gap-1 text-xs">
        <span class="text-[var(--color-muted)]">From</span>
        <input type="date" bind:value={dStart} class={fieldClass} />
      </label>
      <label class="flex flex-col gap-1 text-xs">
        <span class="text-[var(--color-muted)]">To</span>
        <input type="date" bind:value={dEnd} class={fieldClass} />
      </label>
      <label class="flex flex-col gap-1 text-xs">
        <span class="text-[var(--color-muted)]">Hours/wk</span>
        <input
          type="text"
          inputmode="decimal"
          bind:value={dHours}
          placeholder="16"
          class="w-20 text-right tabular-nums {fieldClass}"
        />
      </label>
    </div>

    <!-- Which days. Optional: leaving it blank spreads the hours across the
         week, which is what every allocation did before patterns existed. -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-[var(--color-muted)]">On</span>
      <div class="flex gap-1" role="group" aria-label="Days of the week">
        {#each DAY_NAMES as name, i (name)}
          {@const on = hasDay(dDays, i)}
          <button
            type="button"
            aria-pressed={on}
            onclick={() => (dDays = toggleDay(dDays, i))}
            class="h-7 w-9 rounded-[var(--radius-sm)] border text-[0.6875rem] font-medium transition-colors {on
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
              : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)]'}"
          >{name}</button>
        {/each}
      </div>
      {#if dDays === 0}
        <button
          type="button"
          onclick={() => (dDays = WEEKDAY_MASK)}
          class="text-xs text-[var(--color-subtle)] underline hover:text-[var(--color-text)]"
        >Mon–Fri</button>
      {:else}
        <button
          type="button"
          onclick={() => (dDays = 0)}
          class="text-xs text-[var(--color-subtle)] underline hover:text-[var(--color-text)]"
        >Any day</button>
      {/if}
      {#if perDayPreview}
        <span class="text-xs text-[var(--color-muted)]">— {perDayPreview}</span>
      {/if}
    </div>

    <div class="flex items-center gap-1">
      <Button size="sm" onclick={onSubmit} loading={saving}>
        <Check size={12} strokeWidth={2} /> {submitLabel}
      </Button>
      <Button size="sm" variant="ghost" onclick={cancel}>Cancel</Button>
    </div>
  </div>
{/snippet}

<div class="flex flex-col gap-2">
  <div class="flex items-center justify-between">
    <h2 class="text-sm font-semibold text-[var(--color-text)]">Team &amp; allocation</h2>
    {#if items.length > 0}
      <span class="text-xs tabular-nums text-[var(--color-subtle)]">
        {formatHours(peakMinutes)}/wk at peak
      </span>
    {/if}
  </div>

  {#if items.length === 0 && !adding}
    <EmptyState
      icon={Users}
      title="Nobody allocated"
      description="Book people onto this project to see it reflected in availability."
      bordered={false}
      compact
    >
      {#snippet actions()}
        <Button variant="secondary" onclick={startAdd}>Allocate someone</Button>
      {/snippet}
    </EmptyState>
  {/if}

  {#if items.length > 0}
    <ul class="flex flex-col gap-1">
      {#each items as a (a.id)}
        <li>
          {#if editingId === a.id}
            {@render allocForm(submitEdit, 'Save')}
          {:else}
            <div class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-[var(--color-surface)]">
              <span class="min-w-0 flex-1 truncate">{a.assigneeName}</span>
              {#if a.dayMask}
                <span class="shrink-0 rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[0.6875rem] text-[var(--color-muted)]">
                  {describeDays(a.dayMask)}
                </span>
              {/if}
              <span class="shrink-0 text-xs text-[var(--color-muted)]">{rangeLabel(a)}</span>
              <span class="w-16 shrink-0 text-right text-xs tabular-nums">
                {formatHours(a.minutesPerWeek)}/wk
              </span>
              <span class="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  onclick={() => startEdit(a)}
                  aria-label="Edit allocation for {a.assigneeName}"
                  class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-bg)]"
                ><Pencil size={12} strokeWidth={2} /></button>
                <button
                  type="button"
                  onclick={() => remove(a)}
                  aria-label="Remove allocation for {a.assigneeName}"
                  class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                ><X size={12} strokeWidth={2} /></button>
              </span>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if adding}
    {@render allocForm(submitAdd, 'Allocate')}
  {:else if items.length > 0}
    <button
      type="button"
      onclick={startAdd}
      class="inline-flex items-center gap-1 self-start rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-highlight-border)] hover:bg-[var(--color-highlight-bg)] hover:text-[var(--color-text)]"
    >
      Allocate someone
    </button>
  {/if}
</div>
