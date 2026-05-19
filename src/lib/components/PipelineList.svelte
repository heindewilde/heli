<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ChevronDown, ChevronRight } from 'lucide-svelte';
  import PipelineItemCard from './PipelineItemCard.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { STAGE_COLOR_SWATCH, type StageColor } from '$lib/stageColors';
  import type { PipelineDetail, PipelineItemRow } from '$lib/server/pipelines';

  type Props = {
    pipeline: PipelineDetail;
    onRemoveItem?: (itemId: string) => void;
  };

  let { pipeline, onRemoveItem }: Props = $props();

  let collapsed = $state<Record<string, boolean>>({});
  let openMoverFor = $state<string | null>(null);

  $effect(() => {
    if (openMoverFor === null) return;
    const close = () => { openMoverFor = null; };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  });

  const stages = $derived(pipeline.stages);
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
    openMoverFor = null;
    const res = await fetch(`/api/pipelines/${pipeline.id}/items/${itemId}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toStageId })
    });
    if (!res.ok) { toast.danger('Move failed'); return; }
    await invalidateAll();
  }
</script>

<div class="flex flex-col gap-3">
  {#each stages as stage (stage.id)}
    {@const items = itemsByStage.get(stage.id) ?? []}
    {@const isCollapsed = collapsed[stage.id] === true}
    {@const dotColor = STAGE_COLOR_SWATCH[(stage.color ?? 'gray') as StageColor]}
    <section class="flex flex-col gap-1">
      <button
        type="button"
        onclick={() => (collapsed = { ...collapsed, [stage.id]: !isCollapsed })}
        class="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left hover:bg-[var(--color-surface)]"
      >
        {#if isCollapsed}
          <ChevronRight size={14} strokeWidth={2} class="text-[var(--color-subtle)]" />
        {:else}
          <ChevronDown size={14} strokeWidth={2} class="text-[var(--color-subtle)]" />
        {/if}
        <span class="h-2 w-2 shrink-0 rounded-full" style="background-color:{dotColor}"></span>
        <h3 class="text-sm font-medium">{stage.name}</h3>
        <span class="ml-auto text-xs text-[var(--color-muted)]">{items.length}</span>
      </button>
      {#if !isCollapsed}
        {#if items.length === 0}
          <p class="ml-6 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs italic text-[var(--color-subtle)]">
            No items in this stage.
          </p>
        {:else}
          <ul class="ml-6 flex flex-col gap-1.5">
            {#each items as item (item.id)}
              <li class="group relative flex items-center gap-2">
                <div class="flex-1">
                  <PipelineItemCard
                    {item}
                    onRemove={onRemoveItem ? () => onRemoveItem!(item.id) : undefined}
                  />
                </div>
                <div class="relative shrink-0">
                  <button
                    type="button"
                    title="Move to stage"
                    onpointerdown={(e) => { e.stopPropagation(); openMoverFor = openMoverFor === item.id ? null : item.id; }}
                    class="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-muted)] opacity-0 transition-opacity hover:border-[var(--color-highlight-border)] hover:text-[var(--color-text)] group-hover:opacity-100 {openMoverFor === item.id ? 'opacity-100' : ''}"
                  >
                    Move
                  </button>
                  {#if openMoverFor === item.id}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      class="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]"
                      onpointerdown={(e) => e.stopPropagation()}
                    >
                      {#each stages.filter((s) => s.id !== item.stageId) as s (s.id)}
                        <button
                          type="button"
                          onclick={() => moveItem(item.id, s.id)}
                          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-highlight-bg)]"
                        >
                          <span class="h-2 w-2 shrink-0 rounded-full" style="background-color:{STAGE_COLOR_SWATCH[(s.color ?? 'gray') as StageColor]}"></span>
                          {s.name}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </section>
  {/each}
</div>
