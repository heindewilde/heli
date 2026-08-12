<script lang="ts">
  import { Trash2, Archive, FolderOpen, Users, Building2, Funnel } from 'lucide-svelte';
  import CollectionIcon from '$lib/components/CollectionIcon.svelte';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyIcon = any;

  type Props = {
    href: string;
    name: string;
    description?: string | null;
    icon?: string | null;
    isArchived: boolean;
    peopleCount: number;
    companyCount: number;
    onArchive?: () => void;
    onDelete?: () => void;
    onCreatePipeline?: () => void;
  };

  let {
    href,
    name,
    description,
    icon,
    isArchived,
    peopleCount,
    companyCount,
    onArchive,
    onDelete,
    onCreatePipeline
  }: Props = $props();

</script>

<a
  {href}
  data-collection-row
  class="group relative flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-all hover:border-[var(--color-highlight-border)] hover:shadow-sm {isArchived ? 'opacity-60' : ''}"
>
  <!-- Action buttons top-right -->
  <span class="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
    {#if onCreatePipeline}
      <button
        type="button"
        title="Create pipeline from this collection"
        onclick={(e) => { e.preventDefault(); onCreatePipeline?.(); }}
        class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-bg)] hover:text-[var(--color-muted)]"
      >
        <Funnel size={13} strokeWidth={2} />
      </button>
    {/if}
    {#if onArchive}
      <button
        type="button"
        title={isArchived ? 'Unarchive' : 'Archive'}
        onclick={(e) => { e.preventDefault(); onArchive?.(); }}
        class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-bg)] hover:text-[var(--color-muted)]"
      >
        <Archive size={13} strokeWidth={2} />
      </button>
    {/if}
    {#if onDelete}
      <button
        type="button"
        title="Delete"
        onclick={(e) => { e.preventDefault(); onDelete?.(); }}
        class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
      >
        <Trash2 size={13} strokeWidth={2} />
      </button>
    {/if}
  </span>

  <!-- Icon -->
  <span class="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-muted)]">
    {#if icon}
      <CollectionIcon name={icon} size={20} strokeWidth={1.75} />
    {:else}
      <FolderOpen size={20} strokeWidth={1.75} />
    {/if}
  </span>

  <!-- Name + description -->
  <div class="min-w-0 flex-1 pr-6">
    <p class="truncate font-semibold text-[var(--color-text)]">{name}</p>
    {#if description}
      <p class="mt-0.5 line-clamp-2 text-xs text-[var(--color-muted)]">{description}</p>
    {:else}
      <p class="mt-0.5 text-xs italic text-[var(--color-subtle)]">No description</p>
    {/if}
  </div>

  <!-- Counts -->
  <div class="flex items-center gap-3 text-xs text-[var(--color-muted)]">
    {#if peopleCount > 0}
      <span class="inline-flex items-center gap-1">
        <Users size={12} strokeWidth={2} />
        {peopleCount}
      </span>
    {/if}
    {#if companyCount > 0}
      <span class="inline-flex items-center gap-1">
        <Building2 size={12} strokeWidth={2} />
        {companyCount}
      </span>
    {/if}
    {#if peopleCount === 0 && companyCount === 0}
      <span class="italic text-[var(--color-subtle)]">empty</span>
    {/if}
  </div>
</a>
