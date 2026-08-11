<script lang="ts">
  /**
   * Nine raw `<select>` elements across nine files, each with its own class
   * string and its own idea of how tall a control is — `h-9` here, `py-1`
   * there, `py-1.5` in the board, `py-2` in settings. Several were
   * `bg-transparent` with no border at all, so on the list pages the sort
   * control was invisible until you found it.
   *
   * Still a native `<select>`. A custom listbox would mean re-implementing
   * typeahead, keyboard semantics and the mobile picker to end up somewhere
   * worse — Combobox already exists for the cases that genuinely need search.
   * What this adds is a consistent shell and a chevron, since `appearance-none`
   * removes the platform's own.
   *
   * `ghost` keeps the borderless look for toolbar sorts, but only visually: the
   * control still gets a hover surface and a focus ring, so it can be found.
   */
  import { ChevronDown } from 'lucide-svelte';
  import type { Snippet } from 'svelte';
  import type { HTMLSelectAttributes } from 'svelte/elements';

  type Size = 'sm' | 'md';

  // `size` is shadowed deliberately. The native `<select size>` renders a
  // scrolling list box, which nothing here wants, and leaving it in the union
  // types the prop as `never`.
  type Props = Omit<HTMLSelectAttributes, 'size'> & {
    value?: string | number | null;
    size?: Size;
    /** Borderless until hovered — for toolbar controls like a sort picker. */
    ghost?: boolean;
    /** Leading icon, matching the chevron's weight. */
    icon?: Snippet;
    children: Snippet;
  };

  let {
    value = $bindable(),
    size = 'sm',
    ghost = false,
    icon,
    class: className = '',
    disabled,
    children,
    ...rest
  }: Props = $props();

  const SIZES: Record<Size, string> = {
    sm: 'h-8 pl-2.5 pr-7 text-xs',
    md: 'h-9 pl-3 pr-8 text-sm'
  };
</script>

<div class="relative inline-flex min-w-0 items-center {className}">
  {#if icon}
    <span
      class="pointer-events-none absolute left-2.5 flex items-center text-[var(--color-subtle)]"
      aria-hidden="true"
    >
      {@render icon()}
    </span>
  {/if}

  <select
    bind:value
    {disabled}
    class="w-full min-w-0 cursor-pointer appearance-none truncate rounded-[var(--radius-md)] font-medium text-[var(--color-text)] transition-colors disabled:cursor-not-allowed disabled:opacity-50 {ghost
      ? 'border border-transparent bg-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-surface)]'
      : 'border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]'} {SIZES[
      size
    ]} {icon ? (size === 'md' ? 'pl-9' : 'pl-8') : ''}"
    {...rest}
  >
    {@render children()}
  </select>

  <ChevronDown
    size={size === 'md' ? 15 : 13}
    strokeWidth={2}
    class="pointer-events-none absolute right-2 text-[var(--color-subtle)]"
    aria-hidden="true"
  />
</div>
