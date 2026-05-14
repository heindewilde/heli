<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Eye, EyeOff } from 'lucide-svelte';
  import PipelineItemCard from './PipelineItemCard.svelte';
  import { toast } from '$lib/toasts.svelte';
  import type { PipelineDetail, PipelineItemRow } from '$lib/server/pipelines';
  import type { PipelineStage, StageKind } from '$lib/server/schema';
  import { STAGE_COLOR_BOARD, type StageColor } from '$lib/stageColors';

  type Props = {
    pipeline: PipelineDetail;
    onRemoveItem?: (itemId: string) => void;
  };

  let { pipeline, onRemoveItem }: Props = $props();

  let showTerminal = $state(false);
  let dragItemId = $state<string | null>(null);
  let dragOverStage = $state<string | null>(null);

  const stages = $derived(pipeline.stages);
  const visibleStages = $derived(
    showTerminal ? stages : stages.filter((s) => s.kind === 'open')
  );
  const itemsByStage = $derived.by(() => {
    const map = new Map<string, PipelineItemRow[]>();
    for (const s of stages) map.set(s.id, []);
    for (const i of pipeline.items) {
      const list = map.get(i.stageId);
      if (list) list.push(i);
    }
    return map;
  });

  async function moveItem(itemId: string, toStageId: string) {
    const res = await fetch(`/api/pipelines/${pipeline.id}/items/${itemId}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toStageId })
    });
    if (!res.ok) {
      toast.danger('Move failed');
      return;
    }
    await invalidateAll();
  }

  function onDragStart(itemId: string) {
    dragItemId = itemId;
  }
  function onDragEnd() {
    dragItemId = null;
    dragOverStage = null;
  }
  function onDragOver(e: DragEvent, stageId: string) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOverStage = stageId;
  }
  function onDragLeave(stageId: string) {
    if (dragOverStage === stageId) dragOverStage = null;
  }
  async function onDrop(e: DragEvent, stageId: string) {
    e.preventDefault();
    const id = dragItemId;
    dragOverStage = null;
    dragItemId = null;
    if (!id) return;
    const item = pipeline.items.find((i) => i.id === id);
    if (!item || item.stageId === stageId) return;
    await moveItem(id, stageId);
  }

  function stageColumnStyle(stage: PipelineStage): string {
    const c = stage.color ? STAGE_COLOR_BOARD[stage.color as StageColor] : null;
    if (c) return `border-color:${c.border};background-color:${c.bg}`;
    if (stage.kind === 'won') return 'border-color:var(--color-success-border);background-color:var(--color-success-bg)';
    if (stage.kind === 'lost') return 'border-color:var(--color-danger-border);background-color:var(--color-danger-bg)';
    return '';
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center justify-end">
    <button
      type="button"
      onclick={() => (showTerminal = !showTerminal)}
      class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
    >
      {#if showTerminal}
        <EyeOff size={12} strokeWidth={2} /> Hide won/lost
      {:else}
        <Eye size={12} strokeWidth={2} /> Show won/lost
      {/if}
    </button>
  </div>

  <div class="flex gap-3 overflow-x-auto pb-2">
    {#each visibleStages as stage (stage.id)}
      {@const items = itemsByStage.get(stage.id) ?? []}
      {@const hot = dragOverStage === stage.id}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <section
        aria-label={`${stage.name} stage`}
        class="flex w-72 shrink-0 flex-col gap-2 rounded-[var(--radius-md)] border p-2 transition-colors {!stage.color && stage.kind === 'open' ? 'border-[var(--color-border)] bg-[var(--color-surface)]' : ''} {hot ? 'ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-bg)]' : ''}"
        style={stageColumnStyle(stage)}
        ondragover={(e) => onDragOver(e, stage.id)}
        ondragleave={() => onDragLeave(stage.id)}
        ondrop={(e) => onDrop(e, stage.id)}
      >
        <header class="flex items-center justify-between px-1">
          <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">
            {stage.name}
          </h3>
          <span class="text-xs text-[var(--color-muted)]">{items.length}</span>
        </header>
        <div class="flex flex-col gap-2">
          {#each items as item (item.id)}
            <PipelineItemCard
              {item}
              draggable={true}
              onDragStart={() => onDragStart(item.id)}
              onDragEnd={onDragEnd}
              onRemove={onRemoveItem ? () => onRemoveItem!(item.id) : undefined}
            />
          {/each}
          {#if items.length === 0}
            <div class="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] p-3 text-center text-xs italic text-[var(--color-subtle)]">
              Drop here
            </div>
          {/if}
        </div>
      </section>
    {/each}
  </div>
</div>
