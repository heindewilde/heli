<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Funnel, Plus, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import type { PipelineMembershipForEntity } from '$lib/server/pipelines';
  import type { MemberKind } from '$lib/server/schema';
  import Popover from '$lib/ui/Popover.svelte';
  import Combobox from '$lib/ui/Combobox.svelte';
  import PipelineStageChip from './PipelineStageChip.svelte';

  type Props = {
    kind: MemberKind;
    refId: string;
    pipelines: PipelineMembershipForEntity[];
  };

  let { kind, refId, pipelines }: Props = $props();

  type Candidate = { id: string; name: string; isArchived: number };

  let pickerOpen = $state(false);
  let stageOptions = $state<Record<string, { id: string; name: string; kind: string }[]>>({});

  const memberOf = $derived(new Set(pipelines.map((p) => p.pipelineId)));

  async function search(q: string): Promise<Candidate[]> {
    const r = await fetch(`/api/pipelines?mode=typeahead&q=${encodeURIComponent(q)}&limit=20`);
    if (!r.ok) return [];
    const data = await r.json();
    return ((data.items ?? []) as Candidate[]).filter(
      (c) => !memberOf.has(c.id) && !c.isArchived
    );
  }

  // Preload stage options so the popover opens with content on first click.
  $effect(() => {
    const pids = [...new Set(pipelines.map((p) => p.pipelineId))];
    for (const pid of pids) {
      if (!stageOptions[pid]) loadStages(pid);
    }
  });

  async function add(pipelineId: string) {
    const res = await fetch(`/api/pipelines/${pipelineId}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, refId })
    });
    if (!res.ok) {
      toast.danger('Could not add to pipeline');
      return;
    }
    pickerOpen = false;
    await invalidateAll();
  }

  async function remove(pipelineId: string, itemId: string) {
    const res = await fetch(`/api/pipelines/${pipelineId}/items?itemId=${encodeURIComponent(itemId)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      toast.danger('Could not remove');
      return;
    }
    await invalidateAll();
  }

  async function loadStages(pipelineId: string) {
    if (stageOptions[pipelineId]) return;
    const res = await fetch(`/api/pipelines/${pipelineId}`);
    if (!res.ok) return;
    const data = await res.json();
    stageOptions = {
      ...stageOptions,
      [pipelineId]: (data.stages ?? []).map((s: { id: string; name: string; kind: string }) => ({
        id: s.id,
        name: s.name,
        kind: s.kind
      }))
    };
  }

  async function moveStage(pipelineId: string, itemId: string, toStageId: string) {
    const res = await fetch(`/api/pipelines/${pipelineId}/items/${itemId}/move`, {
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

</script>

<div class="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
  <header class="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
    <div class="flex items-center gap-1.5">
      <h3 class="text-sm font-semibold text-[var(--color-text)]">Pipelines</h3>
      {#if pipelines.length > 0}
        <span class="rounded-full bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">{pipelines.length}</span>
      {/if}
    </div>
  </header>

  <div class="flex flex-1 flex-col gap-1 p-2">
    {#if pipelines.length === 0}
      <div class="flex flex-col items-center gap-1 px-3 py-4 text-center">
        <Funnel size={18} strokeWidth={1.5} class="text-[var(--color-subtle)]" />
        <p class="text-xs text-[var(--color-muted)]">Not in any pipeline</p>
      </div>
    {:else}
      <ul class="flex flex-col gap-1">
        {#each pipelines as p (p.itemId)}
          <li class="group rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[var(--color-bg)] {p.isArchived ? 'opacity-60' : ''}">
            <div class="flex items-center gap-2">
              <Funnel size={11} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
              <a href={`/pipelines/${p.pipelineId}`} class="min-w-0 flex-1 truncate text-sm hover:underline">{p.pipelineName}</a>
              <button
                type="button"
                onclick={() => remove(p.pipelineId, p.itemId)}
                aria-label="Remove from {p.pipelineName}"
                class="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] group-hover:opacity-100"
              >
                <X size={11} strokeWidth={2} />
              </button>
            </div>
            <div class="mt-1 flex items-center gap-1 pl-[18px]">
              <PipelineStageChip
                stageId={p.stageId}
                stageName={p.stageName}
                stageKind={p.stageKind}
                stages={stageOptions[p.pipelineId] ?? []}
                onMove={(to) => moveStage(p.pipelineId, p.itemId, to)}
              />
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <footer class="border-t border-[var(--color-border)]">
    <Popover
      bind:open={pickerOpen}
      label="Add to pipeline"
      panelRole="dialog"
      placement="top-start"
      matchWidth
      autoFocus={false}
      class="w-full"
    >
      {#snippet trigger(attrs)}
        <button
          {...attrs}
          type="button"
          class="flex w-full items-center justify-center gap-1.5 rounded-b-[var(--radius-md)] px-3 py-2 text-xs text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
        >
          <Plus size={12} strokeWidth={2} />
          Add to pipeline
        </button>
      {/snippet}

      {#snippet content()}
        <Combobox
          {search}
          getId={(p) => p.id}
          searchOnOpen
          placeholder="Search pipelines\u2026"
          emptyText="No matching pipelines. Create one from the Pipelines tab."
          onSelect={(p) => add(p.id)}
        >
          {#snippet option(p: Candidate)}
            <Funnel size={12} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
            <span class="min-w-0 flex-1 truncate">{p.name}</span>
          {/snippet}
        </Combobox>
      {/snippet}
    </Popover>
  </footer>
</div>
