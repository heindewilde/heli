<script lang="ts">
  /**
   * The ~150 hand-written copies of
   * `rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 …`,
   * named once. Nothing clever: `class` still merges last so a call site can
   * override, and every other attribute passes straight through.
   */
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
  type Size = 'xs' | 'sm' | 'md';

  type Props = HTMLButtonAttributes & {
    variant?: Variant;
    size?: Size;
    children: Snippet;
  };

  let {
    variant = 'secondary',
    size = 'sm',
    class: className = '',
    type = 'button',
    children,
    ...rest
  }: Props = $props();

  const VARIANTS: Record<Variant, string> = {
    primary:
      'bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]',
    secondary:
      'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-2)]',
    ghost: 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]',
    danger:
      'border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] hover:border-[var(--color-danger)]'
  };

  const SIZES: Record<Size, string> = {
    xs: 'gap-1 px-2 py-0.5 text-[11px]',
    sm: 'gap-1.5 px-2.5 py-1 text-xs',
    md: 'gap-2 px-3 py-1.5 text-sm'
  };
</script>

<button
  {type}
  class="inline-flex items-center justify-center rounded-[var(--radius-sm)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 {VARIANTS[
    variant
  ]} {SIZES[size]} {className}"
  {...rest}
>
  {@render children()}
</button>
