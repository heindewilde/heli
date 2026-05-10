<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ChevronDown, ChevronRight } from 'lucide-svelte';
  import PipelineItemCard from './PipelineItemCard.svelte';
  import { toast } from '$lib/toasts.svelte';
  import type { PipelineDetail, PipelineItemRow } from '$lib/server/pipelines';
  import type { StageKind } from '$lib/server/schema';

  type Props = {
    pipeline: PipelineDetail;
    onRemoveItem?: (itemId: string) => void;
  };

  let { pipeline, onRemoveItem }: Props = $props();

  let collapsed = $state<Record<string, boolean>>({});

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

  function kindBadge(kind: StageKind): { label: string; cls: string } {
    if (kind === 'won') return { label: 'won', cls: 'bg-emerald-300/15 text-emerald-700 dark:text-emerald-300' };
    if (kind === 'lost') return { label: 'lost', cls: 'bg-rose-300/15 text-rose-700 dark:text-rose-300' };
    return { label: 'open', cls: 'bg-[var(--color-surface)] text-[var(--color-muted)]' };
  }
</script>

<div class="flex flex-col gap-3">
  {#each stages as stage (stage.id)}
    {@const items = itemsByStage.get(stage.id) ?? []}
    {@const isCollapsed = collapsed[stage.id] === true}
    {@const badge = kindBadge(stage.kind as StageKind)}
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
        <h3 class="text-sm font-medium">{stage.name}</h3>
        <span class="rounded-full px-1.5 py-0.5 text-[10px] {badge.cls}">{badge.label}</span>
        <span class="ml-auto text-xs text-[var(--color-muted)]">{items.length}</span>
      </button>
      {#if !isCollapsed}
        {#if items.length === 0}
          <p class="ml-6 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs italic text-[var(--color-subtle)]">
            No items in this stage.
          </p>
        {:else}
          <ul class="ml-6 flex flex-col gap-2">
            {#each items as item (item.id)}
              <li class="flex items-center gap-2">
                <div class="flex-1">
                  <PipelineItemCard
                    {item}
                    onRemove={onRemoveItem ? () => onRemoveItem!(item.id) : undefined}
                  />
                </div>
                <select
                  value={item.stageId}
                  onchange={(e) => moveItem(item.id, (e.currentTarget as HTMLSelectElement).value)}
                  class="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
                  title="Move to stage"
                >
                  {#each stages as s (s.id)}
                    <option value={s.id}>{s.name}</option>
                  {/each}
                </select>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </section>
  {/each}
</div>
