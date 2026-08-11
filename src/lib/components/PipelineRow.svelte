<script lang="ts">
  import { Trash2, Archive, Funnel } from 'lucide-svelte';
  import Badge from '$lib/ui/Badge.svelte';

  type Props = {
    href: string;
    name: string;
    description?: string | null;
    isArchived: boolean;
    openCount: number;
    wonCount: number;
    lostCount: number;
    stageCount: number;
    selected?: boolean;
    onArchive?: () => void;
    onDelete?: () => void;
  };

  let {
    href,
    name,
    description,
    isArchived,
    openCount,
    wonCount,
    lostCount,
    stageCount,
    selected = false,
    onArchive,
    onDelete
  }: Props = $props();
</script>

<a
  {href}
  data-pipeline-row
  class="group flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 transition-colors {selected
    ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)]'
    : 'border-transparent hover:bg-[var(--color-surface)]'} {isArchived ? 'opacity-60' : ''}"
>
  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
    <Funnel size={16} strokeWidth={2} />
  </span>
  <span class="min-w-0 flex-1">
    <span class="truncate text-sm font-medium text-[var(--color-text)]">{name}</span>
    <span class="block truncate text-xs text-[var(--color-muted)]">
      {#if description}{description}{:else}<span class="italic text-[var(--color-subtle)]">{stageCount} {stageCount === 1 ? 'stage' : 'stages'}</span>{/if}
    </span>
  </span>
  <span class="hidden items-center gap-1.5 sm:flex">
    {#if openCount > 0}
      <Badge size="md">{openCount} open</Badge>
    {/if}
    {#if wonCount > 0}
      <!-- Was `emerald-300/40` + a `dark:` utility, i.e. the raw Tailwind
           palette and a variant that compiled against the OS rather than the
           app's theme toggle. Same colour, now from the semantic token. -->
      <Badge size="md" tone="success">{wonCount} won</Badge>
    {/if}
    {#if lostCount > 0}
      <Badge size="md">{lostCount} lost</Badge>
    {/if}
  </span>
  <span class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 {selected ? 'opacity-100' : ''}">
    {#if onArchive}
      <button
        type="button"
        title={isArchived ? 'Unarchive' : 'Archive'}
        onclick={(e) => { e.preventDefault(); onArchive?.(); }}
        class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-bg)]"
      >
        <Archive size={14} strokeWidth={2} />
      </button>
    {/if}
    {#if onDelete}
      <button
        type="button"
        title="Delete"
        onclick={(e) => { e.preventDefault(); onDelete?.(); }}
        class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
      >
        <Trash2 size={14} strokeWidth={2} />
      </button>
    {/if}
  </span>
</a>
