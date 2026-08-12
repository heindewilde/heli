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
  }

  function startEdit(a: AllocationRow) {
    editingId = a.id;
    adding = false;
    dAssignee = a.assigneeUserId;
    dStart = toDateInput(a.startDate);
    dEnd = toDateInput(a.endDate);
    dHours = String(minutesToHours(a.minutesPerWeek));
  }

  function cancel() {
    adding = false;
    editingId = null;
  }

  /** Shared validation so the add and edit paths cannot disagree. */
  function readDraft(): { assigneeUserId: string; startDate: number; endDate: number; minutesPerWeek: number } | null {
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
    return { assigneeUserId: dAssignee, startDate, endDate, minutesPerWeek };
  }

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
    };
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
            <div class="flex flex-wrap items-end gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
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
              <div class="flex items-center gap-1">
                <Button size="sm" onclick={submitEdit} loading={saving}>
                  <Check size={12} strokeWidth={2} /> Save
                </Button>
                <Button size="sm" variant="ghost" onclick={cancel}>Cancel</Button>
              </div>
            </div>
          {:else}
            <div class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-[var(--color-surface)]">
              <span class="min-w-0 flex-1 truncate">{a.assigneeName}</span>
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
    <div class="flex flex-wrap items-end gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
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
      <div class="flex items-center gap-1">
        <Button size="sm" onclick={submitAdd} loading={saving}>
          <Check size={12} strokeWidth={2} /> Allocate
        </Button>
        <Button size="sm" variant="ghost" onclick={cancel}>Cancel</Button>
      </div>
    </div>
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
