<script lang="ts">
  import { Star, Archive, Trash2, Loader2 } from 'lucide-svelte';
  import CompanyLogo from './CompanyLogo.svelte';

  type Props = {
    href: string;
    name: string;
    sub?: string | null;
    avatarUrl?: string | null;
    domain?: string | null;
    isFavorite: boolean;
    isArchived: boolean;
    parsing?: boolean;
    selected?: boolean;
    onFavorite?: () => void;
    onArchive?: () => void;
    onDelete?: () => void;
  };

  let {
    href,
    name,
    sub,
    avatarUrl,
    domain,
    isFavorite,
    isArchived,
    parsing = false,
    selected = false,
    onFavorite,
    onArchive,
    onDelete
  }: Props = $props();

  const initials = $derived(
    name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase()
  );

  const useLogoDev = $derived(!avatarUrl && !!domain);
</script>

<a
  {href}
  data-entity-row
  class="group relative flex items-center gap-3 rounded-[var(--radius-md)] border border-transparent px-3 py-2 transition-colors hover:bg-[var(--color-surface)] {selected
    ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)]'
    : ''} {isArchived ? 'opacity-60' : ''}"
>
  {#if useLogoDev}
    <CompanyLogo domain={domain} {name} size={36} rounded="full" />
  {:else}
    <span class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-muted)]">
      {#if avatarUrl}
        <img src={avatarUrl} alt="" loading="lazy" class="h-full w-full object-cover" />
      {:else}
        {initials || '·'}
      {/if}
    </span>
  {/if}
  <span class="min-w-0 flex-1">
    <span class="flex items-center gap-2">
      <span class="truncate text-sm font-medium text-[var(--color-text)]">{name}</span>
      {#if parsing}
        <Loader2 size={12} strokeWidth={2} class="animate-spin text-[var(--color-subtle)]" />
      {/if}
    </span>
    <span class="block truncate text-xs text-[var(--color-muted)]">
      {sub ?? domain ?? ''}
    </span>
  </span>
  <span class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100 {selected ? 'opacity-100' : ''}">
    {#if onFavorite}
      <button
        type="button"
        title={isFavorite ? 'Unfavorite' : 'Favorite'}
        onclick={(e) => { e.preventDefault(); onFavorite?.(); }}
        class="rounded-[var(--radius-sm)] p-1.5 hover:bg-[var(--color-bg)] {isFavorite ? 'text-[var(--color-warning)]' : 'text-[var(--color-subtle)]'}"
      >
        <Star size={14} strokeWidth={2} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
    {/if}
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
