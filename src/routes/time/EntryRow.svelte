<script lang="ts">
  /**
   * One tracked stretch. Inline-editable: description, project, duration and
   * the billable flag, each patching on commit.
   *
   * Duration is typed rather than picked — `parseDuration` takes `1:30`,
   * `1.5h`, `90m` or `90`, because a timesheet correction is a number you know,
   * not a range you want to drag.
   */
  import { X, CircleDollarSign } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import Tooltip from '$lib/ui/Tooltip.svelte';
  import Select from '$lib/ui/Select.svelte';
  import { formatMinutes, parseDuration } from '$lib/duration';
  import { projectSwatch } from '$lib/projectColor';
  import { formatTime } from '$lib/interactions';
  import type { TimeEntryRow } from '$lib/server/time';

  type Props = {
    entry: TimeEntryRow;
    projects: { id: string; name: string }[];
    /** Shown only when the list spans more than one person. */
    showWho: boolean;
    onChanged: () => void;
    onRemoved: (id: string) => void;
  };
  let { entry, projects, showWho, onChanged, onRemoved }: Props = $props();

  const minutes = $derived(
    entry.endedAt == null ? 0 : Math.round((entry.endedAt - entry.startedAt) / 60_000)
  );

  let durationDraft = $state('');
  let editingDuration = $state(false);
  // svelte-ignore state_referenced_locally
  let description = $state(entry.description ?? '');
  $effect(() => {
    description = entry.description ?? '';
  });

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/time/${entry.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      toast.danger(res.status === 403 ? 'That entry is not yours to edit' : 'Update failed');
      return false;
    }
    onChanged();
    return true;
  }

  function startDuration() {
    editingDuration = true;
    durationDraft = formatMinutes(minutes);
  }

  async function commitDuration() {
    editingDuration = false;
    const next = parseDuration(durationDraft);
    // null means unparseable — leave the value alone rather than zeroing an
    // afternoon because someone typed "lunch".
    if (next == null || next === minutes) return;
    await patch({ minutes: next });
  }

  async function remove() {
    if (!confirm('Delete this time entry?')) return;
    const res = await fetch(`/api/time/${entry.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.danger(res.status === 403 ? 'That entry is not yours to delete' : 'Delete failed');
      return;
    }
    onRemoved(entry.id);
  }

  const cellClass =
    'rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none';
</script>

<div class="group flex items-center gap-2 rounded-[var(--radius-sm)] py-1 pl-0 pr-1 hover:bg-[var(--color-surface-2)]">
  <!-- Project as colour before it is text. A day is usually two or three
       engagements, and the rail groups them without making you read the
       dropdown on every row. Unfiled entries get a hairline, not a hue. -->
  <span
    class="ml-1 h-6 w-1 shrink-0 rounded-full"
    style="background: {entry.projectId ? projectSwatch(entry.projectId) : 'var(--color-border)'}"
    aria-hidden="true"
  ></span>
  <input
    bind:value={description}
    onblur={() => description !== (entry.description ?? '') && patch({ description: description.trim() || null })}
    onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    placeholder="No description"
    aria-label="Description"
    class="min-w-0 flex-1 {cellClass}"
  />

  {#if showWho}
    <span class="hidden shrink-0 text-xs text-[var(--color-muted)] sm:inline">{entry.userName}</span>
  {/if}

  <Select
    ghost
    label="Project"
    class="w-32 shrink-0"
    value={entry.projectId ?? ''}
    options={[
      { value: '', label: 'No project' },
      ...projects.map((p) => ({ value: p.id, label: p.name }))
    ]}
    onchange={(v) => patch({ projectId: v || null })}
  />

  <Tooltip label={entry.billable ? 'Billable — click to mark non-billable' : 'Not billable — click to mark billable'}>
    {#snippet trigger(attrs)}
      <button
        {...attrs}
        type="button"
        onclick={() => patch({ billable: !entry.billable })}
        aria-label={entry.billable ? 'Mark non-billable' : 'Mark billable'}
        class="shrink-0 rounded-[var(--radius-sm)] p-1 {entry.billable
          ? 'text-[var(--color-success)]'
          : 'text-[var(--color-subtle)] opacity-40 hover:opacity-100'}"
      >
        <CircleDollarSign size={13} strokeWidth={2} />
      </button>
    {/snippet}
  </Tooltip>

  <span class="hidden w-24 shrink-0 text-right text-xs tabular-nums text-[var(--color-subtle)] sm:inline">
    {formatTime(entry.startedAt)}{entry.endedAt ? ` – ${formatTime(entry.endedAt)}` : ''}
  </span>

  {#if editingDuration}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:value={durationDraft}
      onblur={commitDuration}
      onkeydown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitDuration(); }
        if (e.key === 'Escape') editingDuration = false;
      }}
      autofocus
      aria-label="Duration"
      class="w-20 shrink-0 text-right tabular-nums {cellClass} border-[var(--color-border)]"
    />
  {:else}
    <button
      type="button"
      onclick={startDuration}
      class="w-20 shrink-0 text-right text-sm tabular-nums hover:underline"
    >{formatMinutes(minutes)}</button>
  {/if}

  <button
    type="button"
    onclick={remove}
    aria-label="Delete entry"
    class="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] group-hover:opacity-100"
  ><X size={12} strokeWidth={2} /></button>
</div>
