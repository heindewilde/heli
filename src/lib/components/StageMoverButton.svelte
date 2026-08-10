<script lang="ts">
  /**
   * The list view's per-row "Move" button and its stage list.
   *
   * Extracted from PipelineList for the same reason as PipelineStageChip: one
   * `openMoverFor` id was standing in for one popover per row.
   */
  import { STAGE_COLOR_SWATCH, type StageColor } from '$lib/stageColors';
  import Popover from '$lib/ui/Popover.svelte';

  type Stage = { id: string; name: string; color: string | null };

  type Props = {
    stages: Stage[];
    currentStageId: string;
    onMove: (toStageId: string) => void;
  };

  let { stages, currentStageId, onMove }: Props = $props();

  let open = $state(false);

  const options = $derived(stages.filter((s) => s.id !== currentStageId));
</script>

<Popover bind:open label="Move to stage" panelRole="listbox" placement="bottom-end">
  {#snippet trigger(attrs)}
    <button
      {...attrs}
      type="button"
      title="Move to stage"
      class="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-muted)] opacity-0 transition-opacity hover:border-[var(--color-highlight-border)] hover:text-[var(--color-text)] group-hover:opacity-100 {open
        ? 'opacity-100'
        : ''}"
    >
      Move
    </button>
  {/snippet}

  {#snippet content({ close })}
    <div class="min-w-[200px] py-1">
      {#each options as s (s.id)}
        <button
          type="button"
          role="option"
          aria-selected="false"
          onclick={() => {
            close();
            onMove(s.id);
          }}
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-highlight-bg)]"
        >
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            style="background-color:{STAGE_COLOR_SWATCH[(s.color ?? 'gray') as StageColor]}"
          ></span>
          {s.name}
        </button>
      {/each}
    </div>
  {/snippet}
</Popover>
