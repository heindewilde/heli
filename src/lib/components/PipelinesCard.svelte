<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Funnel, Plus, X, ChevronDown } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import type { PipelineMembershipForEntity } from '$lib/server/pipelines';
  import type { MemberKind } from '$lib/server/schema';

  type Props = {
    kind: MemberKind;
    refId: string;
    pipelines: PipelineMembershipForEntity[];
  };

  let { kind, refId, pipelines }: Props = $props();

  let pickerOpen = $state(false);
  let pickerQuery = $state('');
  let candidates = $state<{ id: string; name: string; isArchived: number }[]>([]);
  let loading = $state(false);

  let stageEditing = $state<string | null>(null);
  let stageOptions = $state<Record<string, { id: string; name: string; kind: string }[]>>({});

  const memberOf = $derived(new Set(pipelines.map((p) => p.pipelineId)));
  const filtered = $derived(candidates.filter((c) => !memberOf.has(c.id) && !c.isArchived));

  async function loadCandidates() {
    loading = true;
    try {
      const r = await fetch(`/api/pipelines?mode=typeahead&q=${encodeURIComponent(pickerQuery)}&limit=20`);
      if (!r.ok) {
        candidates = [];
        return;
      }
      const data = await r.json();
      candidates = data.items ?? [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (pickerOpen) loadCandidates();
  });

  let queryTimer: ReturnType<typeof setTimeout> | null = null;
  function onQueryChange() {
    if (queryTimer) clearTimeout(queryTimer);
    queryTimer = setTimeout(loadCandidates, 150);
  }

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
    pickerQuery = '';
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
    stageEditing = null;
    await invalidateAll();
  }

  function stageClass(kind: string): string {
    if (kind === 'won') return 'border-emerald-300/40 bg-emerald-300/15 text-emerald-700 dark:text-emerald-300';
    if (kind === 'lost') return 'border-rose-300/40 bg-rose-300/15 text-rose-700 dark:text-rose-300';
    return 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]';
  }
</script>

<div class="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
  <header class="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
    <div class="flex items-center gap-1.5">
      <Funnel size={12} strokeWidth={2} class="text-[var(--color-subtle)]" />
      <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Pipelines</h3>
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
              <button
                type="button"
                onclick={() => {
                  stageEditing = stageEditing === p.itemId ? null : p.itemId;
                  if (stageEditing === p.itemId) loadStages(p.pipelineId);
                }}
                class="inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] {stageClass(p.stageKind)} hover:opacity-90"
              >
                <span>{p.stageName}</span>
                <ChevronDown size={9} strokeWidth={2.5} />
              </button>
              {#if stageEditing === p.itemId && stageOptions[p.pipelineId]}
                <select
                  value={p.stageId}
                  onchange={(e) => moveStage(p.pipelineId, p.itemId, (e.currentTarget as HTMLSelectElement).value)}
                  class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[10px]"
                >
                  {#each stageOptions[p.pipelineId] as s (s.id)}
                    <option value={s.id}>{s.name}</option>
                  {/each}
                </select>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <footer class="relative border-t border-[var(--color-border)]">
    <button
      type="button"
      onclick={() => (pickerOpen = !pickerOpen)}
      class="flex w-full items-center justify-center gap-1.5 rounded-b-[var(--radius-md)] px-3 py-2 text-xs text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
    >
      <Plus size={12} strokeWidth={2} />
      Add to pipeline
    </button>
    {#if pickerOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="fixed inset-0 z-30" onclick={() => (pickerOpen = false)}></div>
      <div class="absolute bottom-full left-0 right-0 z-40 mb-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 shadow-[var(--shadow-lg)]">
        <input
          bind:value={pickerQuery}
          oninput={onQueryChange}
          placeholder="Search pipelines…"
          class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
        />
        <ul class="mt-1 max-h-60 overflow-y-auto">
          {#if loading}
            <li class="px-2 py-1 text-xs italic text-[var(--color-subtle)]">Loading…</li>
          {:else}
            {#each filtered as p (p.id)}
              <li>
                <button
                  type="button"
                  onclick={() => add(p.id)}
                  class="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm hover:bg-[var(--color-surface)]"
                >
                  <Funnel size={12} strokeWidth={2} class="text-[var(--color-subtle)]" />
                  <span class="truncate">{p.name}</span>
                </button>
              </li>
            {/each}
            {#if filtered.length === 0}
              <li class="px-2 py-1 text-xs italic text-[var(--color-subtle)]">No matching pipelines. Create one from the Pipelines tab.</li>
            {/if}
          {/if}
        </ul>
      </div>
    {/if}
  </footer>
</div>
