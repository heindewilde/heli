<script lang="ts">
  type Props = { open: boolean; onClose: () => void };
  let { open = $bindable(), onClose }: Props = $props();

  const groups = [
    {
      label: 'Global',
      rows: [
        { keys: ['?'], desc: 'Show this help' },
        { keys: ['cmd', 'k'], desc: 'Search everything' },
        { keys: ['/'], desc: 'Focus search input' },
        { keys: ['esc'], desc: 'Close overlay' }
      ]
    },
    {
      label: 'Lists (People / Companies / Interactions)',
      rows: [
        { keys: ['j'], desc: 'Next row' },
        { keys: ['k'], desc: 'Previous row' },
        { keys: ['enter'], desc: 'Open row' },
        { keys: ['e'], desc: 'Open row (edit)' },
        { keys: ['*'], desc: 'Toggle favorite' },
        { keys: ['#'], desc: 'Toggle archive' }
      ]
    }
  ];

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

{#if open}
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Keyboard shortcuts"
    tabindex="-1"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    onkeydown={onKey}
  >
    <div class="w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]">
      <header class="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <h2 class="text-sm font-medium">Keyboard shortcuts</h2>
        <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">esc</kbd>
      </header>
      <div class="flex flex-col gap-4 px-4 py-3">
        {#each groups as g (g.label)}
          <section>
            <h3 class="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-subtle)]">{g.label}</h3>
            <ul class="flex flex-col gap-1">
              {#each g.rows as r (r.desc)}
                <li class="flex items-center justify-between gap-3 text-sm">
                  <span class="text-[var(--color-muted)]">{r.desc}</span>
                  <span class="flex items-center gap-1">
                    {#each r.keys as k, i (i)}
                      <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--color-text)]">{k}</kbd>
                      {#if i < r.keys.length - 1}<span class="text-[var(--color-subtle)]">+</span>{/if}
                    {/each}
                  </span>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    </div>
  </div>
{/if}
