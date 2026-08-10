<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import { allCommands, prettyShortcut } from '$lib/commands/registry.svelte';

  type Props = { open: boolean; onClose: () => void };
  let { open = $bindable(), onClose }: Props = $props();

  // Generated from the registry, not hand-maintained. The old hard-coded list
  // had already drifted — it advertised four scope prefixes when the palette
  // accepts six, and listed no way to create anything — and there was nothing
  // stopping it drifting again.
  const groups = $derived.by(() => {
    const bound = allCommands().filter((c) => c.shortcut);
    const bySection = new Map<string, typeof bound>();
    for (const c of bound) {
      const list = bySection.get(c.section) ?? [];
      list.push(c);
      bySection.set(c.section, list);
    }
    return [...bySection.entries()].map(([label, rows]) => ({ label, rows }));
  });

  // The one thing the registry cannot express: text typed into the palette.
  const PREFIXES = [
    ['p:', 'people'],
    ['c:', 'companies'],
    ['i:', 'interactions'],
    ['pr:', 'projects'],
    ['col:', 'collections'],
    ['pl:', 'pipelines']
  ] as const;
</script>

<Dialog {open} onclose={onClose} label="Keyboard shortcuts" panelClass="max-w-md">
  {#snippet children()}
    <header
      class="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3"
    >
      <h2 class="text-sm font-medium">Keyboard shortcuts</h2>
      <Kbd>esc</Kbd>
    </header>
    <div class="flex max-h-[70vh] flex-col gap-4 overflow-auto px-4 py-3">
      {#each groups as g (g.label)}
        <section>
          <h3
            class="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-subtle)]"
          >
            {g.label}
          </h3>
          <ul class="flex flex-col gap-1">
            {#each g.rows as c (c.id)}
              <li class="flex items-center justify-between gap-3 text-sm">
                <span class="text-[var(--color-muted)]">{c.title}</span>
                <span class="flex shrink-0 items-center gap-1">
                  {#each prettyShortcut(c.shortcut ?? '') as k, i (i)}
                    <Kbd>{k}</Kbd>
                  {/each}
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {/each}

      <section>
        <h3 class="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-subtle)]">
          Search prefixes
        </h3>
        <ul class="flex flex-col gap-1">
          {#each PREFIXES as [prefix, what] (prefix)}
            <li class="flex items-center justify-between gap-3 text-sm">
              <span class="text-[var(--color-muted)]">Scope search to {what}</span>
              <Kbd>{prefix}</Kbd>
            </li>
          {/each}
        </ul>
      </section>
    </div>
  {/snippet}
</Dialog>
