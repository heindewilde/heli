<script lang="ts">
  import { Flag, Check } from 'lucide-svelte';
  import { PRIORITIES, priorityMeta, toneColor, type Priority } from '$lib/priority';
  import Popover from '$lib/ui/Popover.svelte';

  // Same flag icon for every priority — color is the only differentiator
  // (per design spec).

  type Props = {
    value: Priority;
    onChange: (next: Priority) => void;
    disabled?: boolean;
    align?: 'start' | 'center';
  };
  let { value, onChange, disabled = false, align = 'center' }: Props = $props();

  let open = $state(false);

  const meta = $derived(priorityMeta(value));

  function pick(p: Priority, close: () => void) {
    close();
    if (p !== value) onChange(p);
  }
</script>

<Popover
  bind:open
  label="Priority"
  panelRole="listbox"
  class={align === 'center' ? 'items-center justify-center' : ''}
>
  {#snippet trigger(attrs)}
    <button
      {...attrs}
      type="button"
      {disabled}
      aria-label={value == null ? 'Set priority' : `Priority: ${meta.label}`}
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
        <Flag size={12} strokeWidth={2} fill="currentColor" style="color: {toneColor(meta.tone)}" />
      {/if}
    </button>
  {/snippet}

  {#snippet content({ close })}
    <div class="min-w-[140px] py-1">
      {#each PRIORITIES as p (p.label)}
        {@const selected = p.value === value}
        {@const color = toneColor(p.tone)}
        <button
          type="button"
          role="option"
          aria-selected={selected}
          onclick={() => pick(p.value, close)}
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-surface-2)]"
        >
          <span class="flex h-3.5 w-3.5 items-center justify-center">
            {#if p.value == null}
              <span class="h-1.5 w-1.5 rounded-full" style="background: {color}"></span>
            {:else}
              <Flag size={11} strokeWidth={2} fill="currentColor" style="color: {color}" />
            {/if}
          </span>
          <span class="flex-1 {selected ? 'font-medium' : ''}">{p.label}</span>
          {#if selected}
            <Check size={11} strokeWidth={2.5} class="text-[var(--color-muted)]" />
          {/if}
        </button>
      {/each}
    </div>
  {/snippet}
</Popover>
