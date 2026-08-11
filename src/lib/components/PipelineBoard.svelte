<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { X } from 'lucide-svelte';
  import PipelineItemCard from './PipelineItemCard.svelte';
  import { toast } from '$lib/toasts.svelte';
  import type { PipelineDetail, PipelineItemRow } from '$lib/server/pipelines';
  import type { PipelineStage, StageKind } from '$lib/server/schema';
  import { STAGE_COLOR_BOARD, type StageColor } from '$lib/stageColors';

  type Props = {
    pipeline: PipelineDetail;
    onRemoveItem?: (itemId: string) => void;
    /** Outreach templates offered per stage, keyed by stage id. */
    stageTemplates?: Record<string, { id: string; name: string }[]>;
  };

  let { pipeline, onRemoveItem, stageTemplates = {} }: Props = $props();

  let dragItemId = $state<string | null>(null);
  let dragOverStage = $state<string | null>(null);
  let scrollEl = $state<HTMLElement | undefined>(undefined);

  // Edge-scroll state — plain vars so the RAF closure always reads the latest value
  let _rafId: number | null = null;
  let _scrollSpeed = 0;

  function updateEdgeScroll(e: DragEvent) {
    if (!scrollEl) return;
    const { left, right } = scrollEl.getBoundingClientRect();
    const ZONE = 80;
    const MAX = 14;
    const x = e.clientX;
    if (x - left < ZONE) {
      _scrollSpeed = -MAX * (1 - (x - left) / ZONE);
    } else if (right - x < ZONE) {
      _scrollSpeed = MAX * (1 - (right - x) / ZONE);
    } else {
      _scrollSpeed = 0;
    }
    if (_scrollSpeed !== 0 && _rafId === null) {
      const tick = () => {
        _rafId = null;
        if (_scrollSpeed !== 0 && scrollEl) {
          scrollEl.scrollLeft += _scrollSpeed;
          _rafId = requestAnimationFrame(tick);
        }
      };
      _rafId = requestAnimationFrame(tick);
    }
  }

  function stopEdgeScroll() {
    _scrollSpeed = 0;
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
  }

  const stages = $derived(pipeline.stages);
  const visibleStages = $derived(stages);
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
    stopEdgeScroll();
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
  <!-- Mobile: vertical stages list. Drag-and-drop is desktop-only; use the
       stage selector on each card to move items on touch devices. -->
  <div class="sm:hidden flex flex-col gap-3">
    {#each visibleStages as stage (stage.id)}
      {@const items = itemsByStage.get(stage.id) ?? []}
      <section
        aria-label={`${stage.name} stage`}
        class="rounded-[var(--radius-md)] border p-3 {!stage.color && stage.kind === 'open' ? 'border-[var(--color-border)] bg-[var(--color-surface)]' : ''}"
        style={stageColumnStyle(stage)}
      >
        <header class="mb-2 flex items-center justify-between">
          <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">{stage.name}</h3>
          <span class="text-xs text-[var(--color-muted)]">{items.length}</span>
        </header>
        {#if items.length === 0}
          <p class="text-xs italic text-[var(--color-subtle)]">No items</p>
        {:else}
          <div class="flex flex-col gap-2">
            {#each items as item (item.id)}
              {@const itemHref = item.kind === 'person' ? `/people/${item.refId}` : `/companies/${item.refId}`}
              <div class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5">
                <a href={itemHref} class="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">
                  {item.member?.name ?? '(missing)'}
                </a>
                <select
                  value={item.stageId}
                  onchange={(e) => moveItem(item.id, (e.currentTarget as HTMLSelectElement).value)}
                  class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent py-1.5 pl-1 pr-1 text-xs outline-none"
                  aria-label="Move to stage"
                >
                  {#each stages as s (s.id)}
                    <option value={s.id}>{s.name}</option>
                  {/each}
                </select>
                {#if onRemoveItem}
                  <button
                    type="button"
                    title="Remove from pipeline"
                    onclick={() => onRemoveItem!(item.id)}
                    class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)] hover:text-[var(--color-danger)]"
                  ><X size={14} strokeWidth={2} /></button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>

  <!-- Desktop: horizontal kanban board with drag-and-drop -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div bind:this={scrollEl} class="hidden sm:flex gap-3 overflow-x-auto pb-2" ondragover={updateEdgeScroll}>
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
              templates={stageTemplates[stage.id] ?? []}
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
