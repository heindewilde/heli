<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';

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
      label: 'Search prefixes (cmd-K)',
      rows: [
        { keys: ['p:'], desc: 'Scope search to people' },
        { keys: ['c:'], desc: 'Scope search to companies' },
        { keys: ['i:'], desc: 'Scope search to interactions' },
        { keys: ['pr:'], desc: 'Scope search to projects' }
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

</script>

<Dialog {open} onclose={onClose} label="Keyboard shortcuts" panelClass="max-w-md">
  {#snippet children()}
    <header
      class="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3"
    >
      <h2 class="text-sm font-medium">Keyboard shortcuts</h2>
      <Kbd>esc</Kbd>
    </header>
    <div class="flex flex-col gap-4 px-4 py-3">
      {#each groups as g (g.label)}
        <section>
          <h3
            class="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-subtle)]"
          >
            {g.label}
          </h3>
          <ul class="flex flex-col gap-1">
            {#each g.rows as r (r.desc)}
              <li class="flex items-center justify-between gap-3 text-sm">
                <span class="text-[var(--color-muted)]">{r.desc}</span>
                <span class="flex items-center gap-1">
                  {#each r.keys as k, i (i)}
                    <Kbd>{k}</Kbd>
                    {#if i < r.keys.length - 1}<span class="text-[var(--color-subtle)]">+</span>{/if}
                  {/each}
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/snippet}
</Dialog>
