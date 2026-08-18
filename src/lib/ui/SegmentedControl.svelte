<script lang="ts" module>
  export type Segment = {
    value: string;
    label: string;
    href?: string;
    /**
     * A lucide icon component, typed loosely for the same reason `EmptyState`
     * does it — lucide-svelte's generated components don't satisfy Svelte 5's
     * `Component<P>` signature.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon?: any;
  };
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
    /**
     * Icon only, with the label kept for assistive tech and as a tooltip. For
     * a control whose choices are obvious as pictograms — a list/grid density
     * switch — where spelling them out is noise in a crowded toolbar.
     */
    iconOnly?: boolean;
    class?: string;
    /** Optional trailing content inside the track — a count, an icon. */
    children?: Snippet;
  };

  let {
    segments,
    value,
    onchange,
    label,
    size = 'md',
    iconOnly = false,
    class: className = ''
  }: Props = $props();

  const PAD = { sm: 'px-2 py-0.5 text-xs', md: 'px-3 py-1 text-sm' } as const;
  const ICON_PAD = { sm: 'p-1.5', md: 'p-2' } as const;
  const ICON_SIZE = { sm: 13, md: 15 } as const;

  const pad = $derived(iconOnly ? ICON_PAD[size] : PAD[size]);
  const base = $derived(
    `inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] ${pad} transition-colors`
  );
  const tone = (active: boolean) =>
    active
      ? 'bg-[var(--color-surface)] font-medium text-[var(--color-text)] shadow-xs'
      : 'text-[var(--color-muted)] hover:text-[var(--color-text)]';
</script>

<div
  role="group"
  aria-label={label}
  class="inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5 {className}"
>
  {#each segments as s (s.value)}
    {@const active = s.value === value}
    {@const Icon = s.icon}
    {#if s.href}
      <a
        href={s.href}
        aria-current={active ? 'page' : undefined}
        title={iconOnly ? s.label : undefined}
        class="{base} {tone(active)}"
      >
        {#if Icon}<Icon size={ICON_SIZE[size]} strokeWidth={2} />{/if}
        {#if iconOnly}<span class="sr-only">{s.label}</span>{:else}{s.label}{/if}
      </a>
    {:else}
      <button
        type="button"
        aria-pressed={active}
        title={iconOnly ? s.label : undefined}
        onclick={() => onchange?.(s.value)}
        class="{base} {tone(active)}"
      >
        {#if Icon}<Icon size={ICON_SIZE[size]} strokeWidth={2} />{/if}
        {#if iconOnly}<span class="sr-only">{s.label}</span>{:else}{s.label}{/if}
      </button>
    {/if}
  {/each}
</div>
