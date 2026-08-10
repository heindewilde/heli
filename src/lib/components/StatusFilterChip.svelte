<script lang="ts">
  import { Circle, Check } from 'lucide-svelte';
  import { TONE_STYLES, type StatusRow } from '$lib/statuses';
  import Popover from '$lib/ui/Popover.svelte';
  import Button from '$lib/ui/Button.svelte';

  // Filter chip for the Status column. Multi-select; "(no status)" is a
  // pseudo-row represented by the sentinel string 'none' in the URL.
  type Props = {
    statuses: StatusRow[];
    /** Currently-selected status ids; 'none' for unset. null = no filter. */
    selected: string[] | null;
    onChange: (next: string[] | null) => void;
  };
  let { statuses, selected, onChange }: Props = $props();

  let open = $state(false);
  // svelte-ignore state_referenced_locally
  let working = $state<string[]>(selected ?? []);

  $effect(() => {
    working = selected ?? [];
  });

  const active = $derived((selected?.length ?? 0) > 0);
  const summary = $derived.by(() => {
    if (!selected || selected.length === 0) return 'Status';
    if (selected.length === 1) {
      if (selected[0] === 'none') return 'Status: none';
      const s = statuses.find((x) => x.id === selected[0]);
      return s ? `Status: ${s.name}` : 'Status';
    }
    return `Status · ${selected.length}`;
  });

  function toggle(id: string) {
    working = working.includes(id) ? working.filter((x) => x !== id) : [...working, id];
  }

  function commit() {
    onChange(working.length === 0 ? null : [...working]);
  }

  function clearAll(close: () => void) {
    working = [];
    onChange(null);
    close();
  }
</script>

<Popover bind:open label="Status filter" panelRole="dialog" onclose={commit}>
  {#snippet trigger(attrs)}
    <button
      {...attrs}
      type="button"
      class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors {active
        ? 'border-[var(--color-border-strong)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}"
    >
      <Circle size={11} strokeWidth={2} />
      {summary}
    </button>
  {/snippet}

  {#snippet content({ close })}
    <div class="min-w-[200px]">
      <ul class="max-h-[40vh] overflow-auto py-1">
        <li>
          <button
            type="button"
            onclick={() => toggle('none')}
            class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]"
          >
            <span
              class="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[var(--color-border)] {working.includes(
                'none'
              )
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
                : ''}"
            >
              {#if working.includes('none')}<Check
                  size={9}
                  strokeWidth={3}
                  class="text-[var(--color-accent-fg)]"
                />{/if}
            </span>
            <span class="h-1.5 w-1.5 rounded-full bg-[var(--color-subtle)]"></span>
            <span class="flex-1 text-[var(--color-muted)]">No status</span>
          </button>
        </li>
        {#if statuses.length > 0}
          <li class="my-1 border-t border-[var(--color-border)]"></li>
        {/if}
        {#each statuses as s (s.id)}
          {@const styles = TONE_STYLES[s.tone]}
          {@const checked = working.includes(s.id)}
          <li>
            <button
              type="button"
              onclick={() => toggle(s.id)}
              class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]"
            >
              <span
                class="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[var(--color-border)] {checked
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
                  : ''}"
              >
                {#if checked}<Check
                    size={9}
                    strokeWidth={3}
                    class="text-[var(--color-accent-fg)]"
                  />{/if}
              </span>
              <span class="h-1.5 w-1.5 rounded-full" style="background: {styles.dot}"></span>
              <span class="flex-1 truncate">{s.name}</span>
            </button>
          </li>
        {/each}
      </ul>
      <div
        class="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-2 py-1.5"
      >
        <button
          type="button"
          onclick={() => clearAll(close)}
          class="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]">Clear</button
        >
        <Button variant="primary" size="xs" onclick={close}>Apply</Button>
      </div>
    </div>
  {/snippet}
</Popover>
