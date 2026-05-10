<script lang="ts">
  import { Trash2, AlertTriangle } from 'lucide-svelte';
  import StatusChip from './StatusChip.svelte';
  import type { ProjectStatus } from '$lib/server/schema';

  type Props = {
    href: string;
    name: string;
    description?: string | null;
    status: ProjectStatus;
    endDate?: number | null;
    memberCount: number;
    selected?: boolean;
    onDelete?: () => void;
  };

  let {
    href,
    name,
    description,
    status,
    endDate,
    memberCount,
    selected = false,
    onDelete
  }: Props = $props();

  // Overdue means end_date is in the past AND status is still active. Paused
  // and archived projects don't surface as overdue — those states already
  // signal "we're not pushing on this".
  const overdue = $derived(
    status === 'active' && typeof endDate === 'number' && endDate < Date.now()
  );

  const endLabel = $derived.by(() => {
    if (endDate == null) return null;
    const d = new Date(endDate);
    const now = new Date();
    const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const days = Math.round((dStart - todayStart) / 86_400_000);
    if (days === 0) return 'Ends today';
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 1) return 'Ends tomorrow';
    if (days < 14) return `Ends in ${days}d`;
    return `Ends ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  });
</script>

<a
  {href}
  data-project-row
  class="group flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 transition-colors {selected
    ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)]'
    : 'border-transparent hover:bg-[var(--color-surface)]'}"
>
  <span class="min-w-0 flex-1">
    <span class="flex items-center gap-2">
      <span class="truncate text-sm font-medium text-[var(--color-text)]">{name}</span>
      <StatusChip {status} size="sm" />
      {#if overdue}
        <span class="inline-flex items-center gap-0.5 rounded-full border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-danger)]">
          <AlertTriangle size={10} strokeWidth={2} />
          Overdue
        </span>
      {/if}
    </span>
    <span class="block truncate text-xs text-[var(--color-muted)]">
      {#if description}{description}{:else}<span class="italic text-[var(--color-subtle)]">No description</span>{/if}
    </span>
  </span>
  <span class="hidden items-center gap-3 text-xs text-[var(--color-muted)] sm:flex">
    {#if memberCount > 0}
      <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
    {/if}
    {#if endLabel}
      <span class={overdue ? 'text-[var(--color-danger)]' : ''}>{endLabel}</span>
    {/if}
  </span>
  {#if onDelete}
    <span class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 {selected ? 'opacity-100' : ''}">
      <button
        type="button"
        title="Delete"
        onclick={(e) => { e.preventDefault(); onDelete?.(); }}
        class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
      >
        <Trash2 size={14} strokeWidth={2} />
      </button>
    </span>
  {/if}
</a>
