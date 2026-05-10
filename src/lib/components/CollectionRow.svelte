<script lang="ts">
  import { Trash2, Archive, FolderOpen, Users, Building2 } from 'lucide-svelte';

  type Props = {
    href: string;
    name: string;
    description?: string | null;
    isArchived: boolean;
    peopleCount: number;
    companyCount: number;
    selected?: boolean;
    onArchive?: () => void;
    onDelete?: () => void;
  };

  let {
    href,
    name,
    description,
    isArchived,
    peopleCount,
    companyCount,
    selected = false,
    onArchive,
    onDelete
  }: Props = $props();
</script>

<a
  {href}
  data-collection-row
  class="group flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 transition-colors {selected
    ? 'border-[var(--color-product-border)] bg-[var(--color-product-bg)]'
    : 'border-transparent hover:bg-[var(--color-surface)]'} {isArchived ? 'opacity-60' : ''}"
>
  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
    <FolderOpen size={16} strokeWidth={2} />
  </span>
  <span class="min-w-0 flex-1">
    <span class="truncate text-sm font-medium text-[var(--color-text)]">{name}</span>
    <span class="block truncate text-xs text-[var(--color-muted)]">
      {#if description}{description}{:else}<span class="italic text-[var(--color-subtle)]">No description</span>{/if}
    </span>
  </span>
  <span class="hidden items-center gap-3 text-xs text-[var(--color-muted)] sm:flex">
    {#if peopleCount > 0}
      <span class="inline-flex items-center gap-1"><Users size={12} strokeWidth={2} />{peopleCount}</span>
    {/if}
    {#if companyCount > 0}
      <span class="inline-flex items-center gap-1"><Building2 size={12} strokeWidth={2} />{companyCount}</span>
    {/if}
    {#if peopleCount === 0 && companyCount === 0}
      <span class="italic text-[var(--color-subtle)]">empty</span>
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
