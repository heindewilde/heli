<script lang="ts">
  import { X } from 'lucide-svelte';
  import { dismiss } from '$lib/dismiss.svelte';

  type Props = {
    sector: string | null;
    size: string | null;
    onSave: (next: { sector: string | null; size: string | null }) => Promise<void> | void;
  };

  let { sector, size, onSave }: Props = $props();

  const SIZE_BANDS = ['1-10', '10-50', '50-200', '200-1000', '1000+'] as const;

  let open = $state(false);
  let triggerEl = $state<HTMLButtonElement | undefined>(undefined);
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  // svelte-ignore state_referenced_locally
  let draftSector = $state(sector ?? '');
  // svelte-ignore state_referenced_locally
  let draftSize = $state<string | null>(size);
  let saving = $state(false);

  function openMenu() {
    draftSector = sector ?? '';
    draftSize = size;
    open = true;
    setTimeout(() => inputEl?.focus(), 0);
  }

  function closeMenu() {
    open = false;
    triggerEl?.focus();
  }

  async function save() {
    saving = true;
    try {
      const nextSector = draftSector.trim() || null;
      const nextSize = draftSize ?? null;
      if (nextSector === (sector ?? null) && nextSize === (size ?? null)) {
        open = false;
        return;
      }
      await onSave({ sector: nextSector, size: nextSize });
      open = false;
    } finally {
      saving = false;
    }
  }

  function onInputKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
    }
  }
</script>

<div use:dismiss={open ? closeMenu : null} class="relative min-w-0">
  <button
    bind:this={triggerEl}
    type="button"
    aria-label="Edit sector and size"
    aria-haspopup="dialog"
    aria-expanded={open}
    onclick={(e) => {
      e.stopPropagation();
      if (open) closeMenu();
      else openMenu();
    }}
    class="flex min-h-[28px] w-full cursor-pointer items-center truncate rounded-[var(--radius-sm)] px-1.5 py-1 text-left text-xs text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
  >
    {#if sector || size}
      <span class="truncate">
        {#if sector}<span class="text-[var(--color-text)]">{sector}</span>{/if}
        {#if sector && size}<span class="px-1 text-[var(--color-subtle)]">·</span>{/if}
        {#if size}<span class="tabular">{size}</span>{/if}
      </span>
    {:else}
      <span class="text-[var(--color-subtle)]">·</span>
    {/if}
  </button>

  {#if open}
    <div
      role="dialog"
      aria-label="Company details"
      class="absolute left-0 top-full z-50 mt-1 w-[224px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]"
    >
      <div class="flex flex-col gap-2.5 p-2.5">
        <label class="flex flex-col gap-1">
          <span class="cap-label">Sector</span>
          <input
            bind:this={inputEl}
            bind:value={draftSector}
            onkeydown={onInputKey}
            type="text"
            placeholder="e.g. Beverages, SaaS"
            class="h-7 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs outline-none focus:border-[var(--color-border-strong)]"
          />
        </label>

        <div class="flex flex-col gap-1">
          <span class="cap-label">Size</span>
          <div class="flex flex-wrap gap-1">
            {#each SIZE_BANDS as band (band)}
              {@const sel = draftSize === band}
              <button
                type="button"
                onclick={() => (draftSize = sel ? null : band)}
                class="tabular rounded-full border px-2 py-0.5 text-[11px] transition-colors {sel
                  ? 'border-[var(--color-text)] bg-transparent font-semibold text-[var(--color-text)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]'}"
              >
                {band}
              </button>
            {/each}
            {#if draftSize}
              <button
                type="button"
                onclick={() => (draftSize = null)}
                title="Clear size"
                aria-label="Clear size"
                class="inline-flex h-[20px] w-[20px] items-center justify-center rounded-full text-[var(--color-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              >
                <X size={10} strokeWidth={2} />
              </button>
            {/if}
          </div>
        </div>

        <div class="flex items-center justify-end gap-1 pt-0.5">
          <button
            type="button"
            onclick={closeMenu}
            class="rounded-[var(--radius-sm)] px-2 py-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >Cancel</button>
          <button
            type="button"
            onclick={save}
            disabled={saving}
            class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
