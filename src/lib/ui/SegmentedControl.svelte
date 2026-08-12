<script lang="ts" module>
  export type Segment = { value: string; label: string; href?: string };
</script>

<script lang="ts">
  /**
   * A small set of mutually exclusive views — Entries/Report, Grid/Week/Projects.
   *
   * Three of these had been hand-rolled as ad-hoc pill rows with slightly
   * different padding and active treatments. It renders links when the segments
   * carry `href`, because a view is usually a URL and should be middle-clickable
   * and shareable; buttons otherwise.
   */
  import type { Snippet } from 'svelte';

  type Props = {
    segments: Segment[];
    value: string;
    onchange?: (value: string) => void;
    /** Accessible name for the group. */
    label: string;
    size?: 'sm' | 'md';
    class?: string;
    /** Optional trailing content inside the track — a count, an icon. */
    children?: Snippet;
  };

  let { segments, value, onchange, label, size = 'md', class: className = '' }: Props = $props();

  const PAD = { sm: 'px-2 py-0.5 text-xs', md: 'px-3 py-1 text-sm' } as const;
</script>

<div
  role="group"
  aria-label={label}
  class="inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5 {className}"
>
  {#each segments as s (s.value)}
    {@const active = s.value === value}
    {#if s.href}
      <a
        href={s.href}
        aria-current={active ? 'page' : undefined}
        class="rounded-[var(--radius-sm)] {PAD[size]} transition-colors {active
          ? 'bg-[var(--color-surface)] font-medium text-[var(--color-text)] shadow-xs'
          : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}"
      >{s.label}</a>
    {:else}
      <button
        type="button"
        aria-pressed={active}
        onclick={() => onchange?.(s.value)}
        class="rounded-[var(--radius-sm)] {PAD[size]} transition-colors {active
          ? 'bg-[var(--color-surface)] font-medium text-[var(--color-text)] shadow-xs'
          : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}"
      >{s.label}</button>
    {/if}
  {/each}
</div>
