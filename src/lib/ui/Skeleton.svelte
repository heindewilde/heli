<script lang="ts">
  /**
   * Placeholder for a streamed section. Deliberately quiet — a pulsing block
   * that matches the height of what replaces it, so nothing jumps when the
   * real content arrives.
   *
   * `lines` was the only shape available, so a streamed list of *people* got
   * three bars where avatars and two-line rows were about to appear, and the
   * layout jumped anyway. `variant` covers the three shapes the app actually
   * streams into.
   */
  type Variant = 'lines' | 'rows' | 'card';

  type Props = {
    /** Number of lines, or rows for `variant="rows"`. */
    lines?: number;
    variant?: Variant;
    class?: string;
  };
  let { lines = 3, variant = 'lines', class: className = '' }: Props = $props();

  // Varied widths read as content rather than as a loading bar.
  const WIDTHS = ['w-3/4', 'w-full', 'w-2/3', 'w-5/6', 'w-1/2'];
</script>

<div class="flex flex-col {variant === 'rows' ? 'gap-3' : 'gap-2'} {className}" aria-hidden="true">
  {#if variant === 'rows'}
    {#each Array(lines) as _, i (i)}
      <div class="flex items-center gap-3">
        <div class="pulse size-9 shrink-0 rounded-full bg-[var(--color-surface-2)]"></div>
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <div class="pulse h-3 rounded-full bg-[var(--color-surface-2)] {WIDTHS[i % WIDTHS.length]}"></div>
          <div class="pulse h-2.5 w-1/3 rounded-full bg-[var(--color-surface-2)]"></div>
        </div>
      </div>
    {/each}
  {:else if variant === 'card'}
    {#each Array(lines) as _, i (i)}
      <div
        class="pulse h-24 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)]"
      ></div>
    {/each}
  {:else}
    {#each Array(lines) as _, i (i)}
      <div class="pulse h-3 rounded-full bg-[var(--color-surface-2)] {WIDTHS[i % WIDTHS.length]}"></div>
    {/each}
  {/if}
</div>

<style>
  /*
   * No local prefers-reduced-motion block. The global rule in app.css already
   * collapses this to a near-zero duration, and it does so with a duration
   * rather than `animation: none` on purpose — killing an animation mid-flight
   * can strand the element on its first frame, which for a pulse means leaving
   * it at 55% opacity permanently.
   */
  .pulse {
    animation: skeleton-pulse 1.6s ease-in-out infinite;
  }
  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 0.55;
    }
    50% {
      opacity: 0.9;
    }
  }
</style>
