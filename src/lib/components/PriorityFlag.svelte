<script lang="ts">
  import { Flag, Check } from 'lucide-svelte';
  import { PRIORITIES, priorityMeta, type Priority } from '$lib/priority';

  // The cell that lives in the leftmost gutter of the entity table.
  // - When `value` is null, the cell renders as an empty 24px box that picks
  //   up a faint outline + flag on hover so the user knows it's clickable.
  // - When set, a single colored flag fills the cell — same icon for every
  //   priority, color is the only differentiator (per design spec).

  type Props = {
    value: Priority;
    onChange: (next: Priority) => void;
    disabled?: boolean;
    /** Used to position the popover inside dense tables. */
    align?: 'start' | 'center';
  };
  let { value, onChange, disabled = false, align = 'center' }: Props = $props();

  let open = $state(false);
  let triggerEl = $state<HTMLButtonElement | undefined>(undefined);

  const meta = $derived(priorityMeta(value));

  function pick(p: Priority) {
    open = false;
    if (p !== value) onChange(p);
    triggerEl?.focus();
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      open = false;
    }
  }
</script>

<div class="relative inline-flex {align === 'center' ? 'items-center justify-center' : ''}">
  <button
    bind:this={triggerEl}
    type="button"
    {disabled}
    aria-label={value == null ? 'Set priority' : `Priority: ${meta.label}`}
    aria-haspopup="listbox"
    aria-expanded={open}
    onclick={(e) => {
      e.stopPropagation();
      open = !open;
    }}
    onkeydown={onTriggerKey}
    class="group inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-40"
  >
    {#if value == null}
      <Flag
        size={12}
        strokeWidth={1.75}
        class="opacity-0 transition-opacity group-hover:opacity-100"
        style="color: var(--color-subtle)"
      />
    {:else}
      <Flag size={12} strokeWidth={2} fill="currentColor" style="color: {meta.cssColor}" />
    {/if}
  </button>

  {#if open}
    <!-- Click-outside scrim. Catches clicks even outside the popover. -->
    <button
      type="button"
      class="fixed inset-0 z-40 cursor-default"
      aria-label="Close priority menu"
      onclick={() => (open = false)}
    ></button>
    <div
      role="listbox"
      aria-label="Priority"
      class="absolute left-0 top-7 z-50 min-w-[140px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-lg)]"
    >
      {#each PRIORITIES as p (p.label)}
        {@const selected = p.value === value}
        <button
          type="button"
          role="option"
          aria-selected={selected}
          onclick={(e) => {
            e.stopPropagation();
            pick(p.value);
          }}
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-surface-2)]"
        >
          <span class="flex h-3.5 w-3.5 items-center justify-center">
            {#if p.value == null}
              <span class="h-1.5 w-1.5 rounded-full" style="background: {p.cssColor}"></span>
            {:else}
              <Flag size={11} strokeWidth={2} fill="currentColor" style="color: {p.cssColor}" />
            {/if}
          </span>
          <span class="flex-1 {selected ? 'font-medium' : ''}">{p.label}</span>
          {#if selected}
            <Check size={11} strokeWidth={2.5} class="text-[var(--color-muted)]" />
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
