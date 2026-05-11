<script lang="ts">
  import { Circle, Check } from 'lucide-svelte';
  import { TONE_STYLES, type StatusRow } from '$lib/statuses';
  import { dismiss } from '$lib/dismiss.svelte';

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
    const has = working.includes(id);
    working = has ? working.filter((x) => x !== id) : [...working, id];
  }

  function commit() {
    const next = working.length === 0 ? null : [...working];
    onChange(next);
    open = false;
  }

  function clearAll() {
    working = [];
    onChange(null);
    open = false;
  }
</script>

<div use:dismiss={open ? commit : null} class="relative inline-flex">
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-expanded={open}
    class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors {active
      ? 'border-[var(--color-border-strong)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
      : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}"
  >
    <Circle size={11} strokeWidth={2} />
    {summary}
  </button>

  {#if open}
    <div
      role="dialog"
      aria-label="Status filter"
      class="absolute left-0 top-8 z-50 min-w-[200px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-lg)]"
    >
      <ul class="max-h-[40vh] overflow-auto">
        <li>
          <button
            type="button"
            onclick={(e) => { e.stopPropagation(); toggle('none'); }}
            class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]"
          >
            <span class="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[var(--color-border)] {working.includes('none') ? 'bg-[var(--color-accent)] border-[var(--color-accent)]' : ''}">
              {#if working.includes('none')}<Check size={9} strokeWidth={3} class="text-[var(--color-accent-fg)]" />{/if}
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
              onclick={(e) => { e.stopPropagation(); toggle(s.id); }}
              class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]"
            >
              <span class="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[var(--color-border)] {checked ? 'bg-[var(--color-accent)] border-[var(--color-accent)]' : ''}">
                {#if checked}<Check size={9} strokeWidth={3} class="text-[var(--color-accent-fg)]" />{/if}
              </span>
              <span class="h-1.5 w-1.5 rounded-full" style="background: {styles.dot}"></span>
              <span class="flex-1 truncate">{s.name}</span>
            </button>
          </li>
        {/each}
      </ul>
      <div class="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-2 py-1.5">
        <button
          type="button"
          onclick={(e) => { e.stopPropagation(); clearAll(); }}
          class="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >Clear</button>
        <button
          type="button"
          onclick={(e) => { e.stopPropagation(); commit(); }}
          class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)]"
        >Apply</button>
      </div>
    </div>
  {/if}
</div>
