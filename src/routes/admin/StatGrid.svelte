<script lang="ts">
  type Tile = {
    label: string;
    value: string | number;
    sub?: string;
    tone?: 'default' | 'good' | 'warn' | 'danger';
  };
  let { tiles }: { tiles: Tile[] } = $props();
</script>

<div class="grid">
  {#each tiles as t (t.label)}
    <div class="tile" data-tone={t.tone ?? 'default'}>
      <div class="label">{t.label}</div>
      <div class="value">{t.value}</div>
      {#if t.sub}<div class="sub">{t.sub}</div>{/if}
    </div>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.5rem;
  }
  .tile {
    padding: 0.75rem 0.875rem;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .label {
    font-size: 0.75rem;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .value {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-text);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .sub {
    font-size: 0.75rem;
    color: var(--color-muted);
  }
  .tile[data-tone='good'] .value {
    color: var(--color-success);
  }
  .tile[data-tone='warn'] .value {
    color: var(--color-warning);
  }
  .tile[data-tone='danger'] .value {
    color: var(--color-danger);
  }
</style>
