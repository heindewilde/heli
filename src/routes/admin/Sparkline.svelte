<script lang="ts">
  let {
    values,
    label,
    height = 48
  }: { values: number[]; label?: string; height?: number } = $props();

  const max = $derived(Math.max(1, ...values));
  const sum = $derived(values.reduce((s, v) => s + v, 0));
</script>

<div class="wrap">
  {#if label}
    <div class="head">
      <span class="lab">{label}</span>
      <span class="sum">{sum.toLocaleString()}</span>
    </div>
  {/if}
  <div class="bars" style="--h: {height}px">
    {#each values as v, i (i)}
      <div class="bar" style="--p: {(v / max) * 100}%" title={String(v)}></div>
    {/each}
  </div>
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .lab {
    font-size: 0.75rem;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .sum {
    font-size: 0.875rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
  }
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: var(--h);
    padding: 2px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 6px;
  }
  .bar {
    flex: 1 1 0;
    min-width: 2px;
    height: var(--p);
    min-height: 1px;
    background: var(--color-accent);
    border-radius: 1px;
    opacity: 0.85;
  }
  .bar:hover {
    opacity: 1;
  }
</style>
