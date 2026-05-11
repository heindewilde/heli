<script lang="ts">
  import { Flag, Check } from 'lucide-svelte';
  import { PRIORITIES, type Priority } from '$lib/priority';

  // Chip that lives in the filter row. Click to open a popover with the
  // four levels as checkboxes. Multi-select; commits via a callback that
  // writes the URL params on the host page.

  type Props = {
    /** Currently-active priority filter (null = no filter). */
    selected: (Priority)[] | null;
    onChange: (next: (Priority)[] | null) => void;
  };
  let { selected, onChange }: Props = $props();

  let open = $state(false);
  // Local working set; flushed on apply / close.
  // svelte-ignore state_referenced_locally
  let working = $state<(Priority)[]>(selected ?? []);

  $effect(() => {
    working = selected ?? [];
  });

  const active = $derived((selected?.length ?? 0) > 0);
  const summary = $derived.by(() => {
    if (!selected || selected.length === 0) return 'Priority';
    if (selected.length === 1) {
      const m = PRIORITIES.find((p) => p.value === selected[0]);
      return `Priority: ${m?.label ?? '—'}`;
    }
    return `Priority · ${selected.length}`;
  });

  function toggle(p: Priority) {
    const has = working.some((x) => x === p);
    working = has ? working.filter((x) => x !== p) : [...working, p];
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

<div class="relative inline-flex">
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-expanded={open}
    class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors {active
      ? 'border-[var(--color-border-strong)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
      : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}"
  >
    <Flag size={12} strokeWidth={2} />
    {summary}
  </button>

  {#if open}
    <button
      type="button"
      class="fixed inset-0 z-40 cursor-default"
      aria-label="Close priority filter"
      onclick={() => commit()}
    ></button>
    <div
      role="dialog"
      aria-label="Priority filter"
      class="absolute left-0 top-8 z-50 min-w-[180px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-lg)]"
    >
      {#each PRIORITIES as p (p.label)}
        {@const checked = working.some((x) => x === p.value)}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            toggle(p.value);
          }}
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]"
        >
          <span class="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[var(--color-border)] {checked ? 'bg-[var(--color-accent)] border-[var(--color-accent)]' : ''}">
            {#if checked}<Check size={9} strokeWidth={3} class="text-[var(--color-accent-fg)]" />{/if}
          </span>
          {#if p.value == null}
            <span class="h-1.5 w-1.5 rounded-full" style="background: {p.cssColor}"></span>
          {:else}
            <Flag size={11} strokeWidth={2} fill="currentColor" style="color: {p.cssColor}" />
          {/if}
          <span class="flex-1">{p.label}</span>
        </button>
      {/each}
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
