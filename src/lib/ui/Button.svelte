<script lang="ts">
  /**
   * The ~150 hand-written copies of
   * `rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 …`,
   * named once. Nothing clever: `class` still merges last so a call site can
   * override, and every other attribute passes straight through.
   *
   * What the first version lacked, and why each addition is here:
   *
   * - **`href`.** Several "buttons" navigate. As a `<button>` + `goto` they
   *   lost middle-click, open-in-new-tab and the status bar preview. Given an
   *   `href` this renders an `<a>` with identical styling.
   * - **`loading`.** Every async action hand-rolled its own disabled-plus-
   *   spinner. Loading implies disabled, and the label stays put — swapping it
   *   for "Saving…" reflows the row and moves the thing under the cursor.
   * - **`:active` press.** A button that doesn't move on press reads as an
   *   image of a button. One frame of translate is most of what "responsive"
   *   means at this scale.
   * - **`lg`.** The largest button was `px-3 py-1.5` — about 28px tall. There
   *   was no size that could carry a primary call to action.
   * - **`icon`.** Square, for icon-only buttons. These were previously `sm`
   *   buttons with lopsided padding, which is why the topbar icons sat off
   *   centre. Pair with a Tooltip and an `aria-label`.
   *
   * Primary stays ink, not the interactive blue — the reference puts its blue
   * on navigation and links and keeps buttons neutral, and a blue-filled
   * primary is the single most generic surface in the category.
   */
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
  import Spinner from './Spinner.svelte';

  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
  type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

  type Props = Omit<HTMLButtonAttributes & HTMLAnchorAttributes, 'size'> & {
    variant?: Variant;
    size?: Size;
    /** Shows a spinner and disables the control. */
    loading?: boolean;
    /** Renders an `<a>`. */
    href?: string;
    children: Snippet;
  };

  let {
    variant = 'secondary',
    size = 'sm',
    loading = false,
    href,
    class: className = '',
    type = 'button',
    disabled,
    children,
    ...rest
  }: Props = $props();

  const VARIANTS: Record<Variant, string> = {
    primary:
      'bg-[var(--color-accent)] text-[var(--color-accent-fg)] shadow-raised hover:bg-[var(--color-accent-hover)]',
    secondary:
      'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]',
    ghost:
      'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]',
    danger:
      'border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] hover:border-[var(--color-danger)]',
    link: 'text-[var(--color-interactive)] hover:text-[var(--color-interactive-hover)] hover:underline underline-offset-2'
  };

  const SIZES: Record<Size, string> = {
    xs: 'gap-1 px-2 py-0.5 text-2xs',
    sm: 'gap-1.5 px-2.5 py-1 text-xs',
    md: 'gap-2 px-3 py-1.5 text-sm',
    lg: 'gap-2 px-4 py-2 text-sm',
    icon: 'size-8',
    'icon-sm': 'size-7'
  };

  const SPINNER: Record<Size, 'xs' | 'sm' | 'md'> = {
    xs: 'xs',
    sm: 'xs',
    md: 'sm',
    lg: 'sm',
    icon: 'sm',
    'icon-sm': 'xs'
  };

  const inert = $derived(disabled || loading);
  // `link` is text, so the shared chrome — radius, press, shadow — would draw a
  // box round it. Everything else shares it.
  const chrome = $derived(
    variant === 'link'
      ? ''
      : 'rounded-[var(--radius-md)] active:translate-y-px disabled:active:translate-y-0'
  );
  const cls = $derived(
    `inline-flex shrink-0 items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${chrome} ${VARIANTS[variant]} ${SIZES[size]} ${className}`
  );
</script>

{#snippet content()}
  {#if loading}
    <Spinner
      size={SPINNER[size]}
      label={null}
      class={variant === 'primary' ? 'text-[var(--color-accent-fg)]' : 'text-current'}
    />
  {/if}
  {@render children()}
{/snippet}

{#if href}
  <!-- A disabled link is not a thing in HTML; drop the href so it stops being
       a link at all, rather than leaving it clickable-but-faded. -->
  <a
    href={inert ? undefined : href}
    aria-disabled={inert ? 'true' : undefined}
    class="{cls} {inert ? 'pointer-events-none opacity-50' : ''}"
    {...rest}
  >
    {@render content()}
  </a>
{:else}
  <button {type} disabled={inert} aria-busy={loading ? 'true' : undefined} class={cls} {...rest}>
    {@render content()}
  </button>
{/if}
