<script lang="ts">
  import { Flag, Check } from 'lucide-svelte';
  import { PRIORITIES, toneColor, type Priority } from '$lib/priority';
  import Popover from '$lib/ui/Popover.svelte';
  import Button from '$lib/ui/Button.svelte';

  type Props = {
    selected: Priority[] | null;
    onChange: (next: Priority[] | null) => void;
  };
  let { selected, onChange }: Props = $props();

  let open = $state(false);
  // Local buffer flushed on Apply; mirrors `selected` between opens.
  // svelte-ignore state_referenced_locally
  let working = $state<Priority[]>(selected ?? []);

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

  // Dismissing the popover any way at all applies the buffer — pressing
  // outside is a commit, not a cancel, which is what the original did too.
  function commit() {
    onChange(working.length === 0 ? null : [...working]);
  }

  function clearAll(close: () => void) {
    working = [];
    onChange(null);
    close();
  }
</script>

<Popover bind:open label="Priority filter" panelRole="dialog" onclose={commit}>
  {#snippet trigger(attrs)}
    <button
      {...attrs}
      type="button"
      class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors {active
        ? 'border-[var(--color-border-strong)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}"
    >
      <Flag size={12} strokeWidth={2} />
      {summary}
    </button>
  {/snippet}

  {#snippet content({ close })}
    <div class="min-w-[180px]">
      {#each PRIORITIES as p (p.label)}
        {@const checked = working.some((x) => x === p.value)}
        {@const color = toneColor(p.tone)}
        <button
          type="button"
          onclick={() => toggle(p.value)}
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-surface-2)]"
        >
          <span
            class="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-[var(--color-border)] {checked
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
              : ''}"
          >
            {#if checked}<Check size={9} strokeWidth={3} class="text-[var(--color-accent-fg)]" />{/if}
          </span>
          {#if p.value == null}
            <span class="h-1.5 w-1.5 rounded-full" style="background: {color}"></span>
          {:else}
            <Flag size={11} strokeWidth={2} fill="currentColor" style="color: {color}" />
          {/if}
          <span class="flex-1">{p.label}</span>
        </button>
      {/each}
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
