<script lang="ts">
  /**
   * The lucide icon grid used to give a project or collection a glyph.
   * Extracted from /projects/[id], which hand-rolled the popover plus its own
   * pointerdown/Escape listeners.
   */
  import { COLLECTION_ICON_MAP, COLLECTION_ICON_NAMES } from '$lib/collectionIcons';
  import Popover from '$lib/ui/Popover.svelte';

  type Props = {
    value: string | null;
    onChange: (next: string | null) => void;
    /** Rendered as the trigger's face. */
    children: import('svelte').Snippet;
  };

  let { value, onChange, children }: Props = $props();

  let open = $state(false);
</script>

<Popover bind:open label="Choose an icon" panelRole="listbox" class="shrink-0">
  {#snippet trigger(attrs)}
    <button
      {...attrs}
      type="button"
      title="Change icon"
      class="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors hover:border-[var(--color-highlight-border)] hover:text-[var(--color-text)]"
    >
      {@render children()}
    </button>
  {/snippet}

  {#snippet content({ close })}
    <div class="max-h-52 w-64 overflow-y-auto p-2">
      <div class="flex flex-wrap gap-1">
        <button
          type="button"
          title="No icon"
          onclick={() => {
            close();
            onChange(null);
          }}
          class="flex h-7 w-7 items-center justify-center rounded text-[10px] text-[var(--color-subtle)] {!value
            ? 'bg-[var(--color-bg)] ring-1 ring-[var(--color-border-strong)]'
            : 'hover:bg-[var(--color-bg)]'}">—</button
        >
        {#each COLLECTION_ICON_NAMES as name (name)}
          {@const Ic = COLLECTION_ICON_MAP[name]}
          <button
            type="button"
            title={name}
            onclick={() => {
              close();
              onChange(name);
            }}
            class="flex h-7 w-7 items-center justify-center rounded transition-colors {value === name
              ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]'}"
          >
            <Ic size={15} strokeWidth={2} />
          </button>
        {/each}
      </div>
    </div>
  {/snippet}
</Popover>
