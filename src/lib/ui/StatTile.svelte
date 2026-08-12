<script lang="ts">
  /**
   * One headline number, as a card rather than a column of text.
   *
   * The first version was label-over-value with nothing around it, so a row of
   * them read as one undifferentiated block — you had to parse the labels to
   * find where one number ended and the next began. Each is its own surface
   * now, with a tinted icon chip carrying the tone, which is what lets the eye
   * land on "billable" or "amount" without reading.
   *
   * Numbers are `tabular-nums` without the caller asking: a row of these is
   * read as a column of digits and proportional figures jump.
   */
  import type { Snippet } from 'svelte';

  type Tone = 'default' | 'good' | 'warn' | 'danger' | 'info';

  type Props = {
    label: string;
    value: string;
    /** A secondary line — a comparison, a share, a range. */
    sub?: string;
    tone?: Tone;
    /** A lucide icon component. Typed loosely, as in EmptyState. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon?: any;
    /** Renders instead of `value`, for a number that needs markup. */
    children?: Snippet;
    class?: string;
  };

  let {
    label,
    value,
    sub,
    tone = 'default',
    icon: Icon,
    children,
    class: className = ''
  }: Props = $props();

  /** Chip fill and icon colour per tone. The value itself stays ink except
      where the tone is the point — a red total is a warning, a red chip is a
      label. */
  const CHIP: Record<Tone, string> = {
    default: 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
    good: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
    warn: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
    info: 'bg-[var(--color-info-bg)] text-[var(--color-info)]'
  };

  const VALUE: Record<Tone, string> = {
    default: 'text-[var(--color-text)]',
    good: 'text-[var(--color-text)]',
    warn: 'text-[var(--color-warning)]',
    danger: 'text-[var(--color-danger)]',
    info: 'text-[var(--color-text)]'
  };
</script>

<div
  class="flex min-w-0 flex-1 items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 {className}"
>
  {#if Icon}
    <span
      class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] {CHIP[tone]}"
      aria-hidden="true"
    >
      <Icon size={15} strokeWidth={2} />
    </span>
  {/if}
  <div class="flex min-w-0 flex-col gap-0.5">
    <span class="text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--color-subtle)]">
      {label}
    </span>
    <span class="text-xl font-medium tabular-nums leading-tight {VALUE[tone]}">
      {#if children}{@render children()}{:else}{value}{/if}
    </span>
    {#if sub}
      <span class="truncate text-xs text-[var(--color-muted)]">{sub}</span>
    {/if}
  </div>
</div>
