<script lang="ts">
  /**
   * Placeholder for a streamed section. Deliberately quiet — a pulsing block
   * that matches the height of what replaces it, so nothing jumps when the
   * real content arrives.
   */
  type Props = {
    /** Number of stacked lines. */
    lines?: number;
    class?: string;
  };
  let { lines = 3, class: className = '' }: Props = $props();

  // Varied widths read as content rather than as a loading bar.
  const WIDTHS = ['w-3/4', 'w-full', 'w-2/3', 'w-5/6', 'w-1/2'];
</script>

<div class="flex flex-col gap-2 {className}" aria-hidden="true">
  {#each Array(lines) as _, i (i)}
    <div class="h-3 rounded-full bg-[var(--color-surface-2)] {WIDTHS[i % WIDTHS.length]}"></div>
  {/each}
</div>

<style>
  div > div {
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 0.55;
    }
    50% {
      opacity: 0.9;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    div > div {
      animation: none;
    }
  }
</style>
