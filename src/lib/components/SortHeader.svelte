<script lang="ts">
  import { ChevronDown, ChevronUp } from 'lucide-svelte';

  // Header cell that doubles as a sort toggle. Keeps things light: a single
  // direction per key (the URL drives ordering, so re-clicking just toggles
  // back to the page default).

  type Props = {
    label: string;
    sortKey: string;
    current: string;
    href: (sortKey: string) => string;
    /** Direction shown when this column is active. Most columns sort DESC
        (recent/updated) — pass 'asc' for name-like alpha columns. */
    direction?: 'asc' | 'desc';
    align?: 'left' | 'right' | 'center';
    /** If false, render as a non-clickable static label. */
    sortable?: boolean;
  };
  let { label, sortKey, current, href, direction = 'desc', align = 'left', sortable = true }: Props = $props();

  const active = $derived(current === sortKey);
  const alignClass = $derived(
    align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left'
  );
</script>

{#if sortable}
  <a
    href={href(sortKey)}
    data-sveltekit-replacestate
    data-sveltekit-keepfocus
    data-sveltekit-noscroll
    class="group inline-flex w-full items-center gap-1 {alignClass} text-[11px] font-medium uppercase tracking-wide {active ? 'text-[var(--color-text)]' : 'text-[var(--color-subtle)] hover:text-[var(--color-muted)]'}"
  >
    <span>{label}</span>
    {#if active}
      {#if direction === 'desc'}
        <ChevronDown size={11} strokeWidth={2.25} />
      {:else}
        <ChevronUp size={11} strokeWidth={2.25} />
      {/if}
    {/if}
  </a>
{:else}
  <span class="inline-flex w-full items-center {alignClass} text-[11px] font-medium uppercase tracking-wide text-[var(--color-subtle)]">{label}</span>
{/if}
