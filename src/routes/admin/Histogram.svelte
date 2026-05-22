<script lang="ts">
  type Band = { label: string; count: number };
  let { bands, title }: { bands: Band[]; title?: string } = $props();
  const max = $derived(Math.max(1, ...bands.map((b) => b.count)));
</script>

<div class="wrap">
  {#if title}<div class="title">{title}</div>{/if}
  <div class="rows">
    {#each bands as b (b.label)}
      <div class="row">
        <span class="bl">{b.label}</span>
        <div class="bar-wrap">
          <div class="bar" style="--p: {(b.count / max) * 100}%"></div>
        </div>
        <span class="bn">{b.count.toLocaleString()}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .title {
    font-size: 0.75rem;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .row {
    display: grid;
    grid-template-columns: 64px 1fr 56px;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }
  .bl {
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;
  }
  .bn {
    text-align: right;
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }
  .bar-wrap {
    background: var(--color-bg);
    border-radius: 4px;
    height: 14px;
    border: 1px solid var(--color-border);
    overflow: hidden;
  }
  .bar {
    width: var(--p);
    height: 100%;
    background: var(--color-accent);
    opacity: 0.85;
  }
</style>
