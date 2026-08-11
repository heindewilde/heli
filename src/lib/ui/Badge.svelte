<script lang="ts">
  /**
   * Every pill in the app, named once.
   *
   * There were five domain-specific hand-rolls — StatusPill, StatusChip,
   * PipelineStageChip, StatusFilterChip, PriorityFilterChip — plus inline count
   * badges copy-pasted across the dashboard cards, and 107 uses of
   * `rounded-full` with no shared definition between them. Three of those
   * carried raw Tailwind palette colours (`emerald-300/40`, `rose-300/40`),
   * the last stock-palette usage left in the product.
   *
   * Two things this deliberately keeps:
   *
   * - **`tint` for caller-computed colour.** Statuses and pipeline stages let a
   *   user pick a hue at runtime, so their colours cannot be a variant here.
   *   Passing `tint` sets the three custom properties the `custom` tone reads,
   *   which keeps the inline `style=` at one well-known shape instead of each
   *   chip inventing its own.
   * - **`dot`.** A leading dot is how a status reads as a status rather than as
   *   a label, and it is the only part of these chips that carries the hue when
   *   the surface itself must stay quiet.
   */
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type Tone =
    | 'neutral'
    | 'accent'
    | 'interactive'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
    | 'custom';
  type Size = 'sm' | 'md';

  type Props = HTMLAttributes<HTMLSpanElement> & {
    tone?: Tone;
    size?: Size;
    /** Filled rather than tinted. Reserve for the one thing that must shout. */
    solid?: boolean;
    /** Leading dot in the tone's colour. */
    dot?: boolean;
    /** `{ fg, bg, border }` for `tone="custom"` — runtime-chosen hues. */
    tint?: { fg: string; bg: string; border: string };
    children: Snippet;
  };

  let {
    tone = 'neutral',
    size = 'sm',
    solid = false,
    dot = false,
    tint,
    class: className = '',
    style,
    children,
    ...rest
  }: Props = $props();

  const TONES: Record<Tone, string> = {
    neutral:
      'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)]',
    accent:
      'border-[var(--color-accent-soft-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent-soft-text)]',
    interactive:
      'border-[var(--color-interactive-soft-border)] bg-[var(--color-interactive-soft)] text-[var(--color-interactive-soft-text)]',
    success:
      'border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)]',
    warning:
      'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    danger:
      'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
    info: 'border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-[var(--color-info)]',
    custom: 'border-[var(--badge-border)] bg-[var(--badge-bg)] text-[var(--badge-fg)]'
  };

  const SOLID: Record<Tone, string> = {
    neutral: 'border-transparent bg-[var(--color-muted)] text-[var(--color-surface)]',
    accent: 'border-transparent bg-[var(--color-accent)] text-[var(--color-accent-fg)]',
    interactive:
      'border-transparent bg-[var(--color-interactive)] text-[var(--color-interactive-fg)]',
    success: 'border-transparent bg-[var(--color-success)] text-white',
    warning: 'border-transparent bg-[var(--color-warning)] text-white',
    danger: 'border-transparent bg-[var(--color-danger)] text-white',
    info: 'border-transparent bg-[var(--color-info)] text-white',
    custom: 'border-transparent bg-[var(--badge-fg)] text-[var(--color-surface)]'
  };

  const SIZES: Record<Size, string> = {
    sm: 'gap-1 px-1.5 py-px text-2xs',
    md: 'gap-1.5 px-2 py-0.5 text-xs'
  };

  const tintStyle = $derived(
    tint
      ? `--badge-fg:${tint.fg};--badge-bg:${tint.bg};--badge-border:${tint.border};${style ?? ''}`
      : style
  );
</script>

<span
  class="inline-flex max-w-full items-center rounded-full border font-medium whitespace-nowrap {solid
    ? SOLID[tone]
    : TONES[tone]} {SIZES[size]} {className}"
  style={tintStyle}
  {...rest}
>
  {#if dot}
    <span
      class="size-1.5 shrink-0 rounded-full bg-current"
      aria-hidden="true"
    ></span>
  {/if}
  <span class="min-w-0 truncate">{@render children()}</span>
</span>
