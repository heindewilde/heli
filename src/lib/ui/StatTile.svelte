<script lang="ts">
  /**
   * One headline number with its label.
   *
   * `admin/StatGrid.svelte` has done this for operator metrics since the admin
   * page was built; this is the same idea promoted into the kit so the report
   * and the availability summary can use it too. Numbers are `tabular-nums`
   * without the caller asking, because a row of these is read as a column of
   * digits and proportional figures make them jump.
   */
  import type { Snippet } from 'svelte';

  type Tone = 'default' | 'good' | 'warn' | 'danger';

  type Props = {
    label: string;
    value: string;
    /** A secondary line — a comparison, a share, a currency. */
    sub?: string;
    tone?: Tone;
    /** Renders instead of `value`, for a number that needs markup. */
    children?: Snippet;
    class?: string;
  };

  let { label, value, sub, tone = 'default', children, class: className = '' }: Props = $props();

  const TONES: Record<Tone, string> = {
    default: 'text-[var(--color-text)]',
    good: 'text-[var(--color-success)]',
    warn: 'text-[var(--color-warning)]',
    danger: 'text-[var(--color-danger)]'
  };
</script>

<div class="flex min-w-0 flex-col gap-0.5 {className}">
  <span class="text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--color-subtle)]">
    {label}
  </span>
  <span class="text-xl tabular-nums leading-tight {TONES[tone]}">
    {#if children}{@render children()}{:else}{value}{/if}
  </span>
  {#if sub}
    <span class="truncate text-xs text-[var(--color-muted)]">{sub}</span>
  {/if}
</div>
