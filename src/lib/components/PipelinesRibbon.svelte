<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Funnel, Plus, X } from 'lucide-svelte';
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

  function badgeClass(kind: string): string {
    if (kind === 'won') return 'border-emerald-300/40 bg-emerald-300/15 text-emerald-700 dark:text-emerald-300';
    if (kind === 'lost') return 'border-rose-300/40 bg-rose-300/15 text-rose-700 dark:text-rose-300';
    return 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]';
  }
</script>

<div class="flex flex-wrap items-center gap-1.5">
  {#each pipelines as p (p.itemId)}
    <div class="group inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-0.5 pl-2 pr-1 text-xs {p.isArchived ? 'opacity-60' : ''}">
      <a href={`/pipelines/${p.pipelineId}`} class="inline-flex items-center gap-1 hover:underline">
        <Funnel size={10} strokeWidth={2} class="text-[var(--color-subtle)]" />
        <span>{p.pipelineName}</span>
      </a>
      <span class="text-[var(--color-subtle)]">·</span>
      <button
        type="button"
        onclick={() => {
          stageEditing = stageEditing === p.itemId ? null : p.itemId;
          if (stageEditing === p.itemId) loadStages(p.pipelineId);
        }}
        class="inline-flex items-center rounded-full border px-1.5 py-px text-[10px] {badgeClass(p.stageKind)} hover:opacity-90"
      >{p.stageName}</button>
      <button
        type="button"
        onclick={() => remove(p.pipelineId, p.itemId)}
        aria-label="Remove from {p.pipelineName}"
        class="rounded-full p-0.5 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-bg)] group-hover:opacity-100"
      >
        <X size={10} strokeWidth={2} />
      </button>
      {#if stageEditing === p.itemId && stageOptions[p.pipelineId]}
        <select
          value={p.stageId}
          onchange={(e) => moveStage(p.pipelineId, p.itemId, (e.currentTarget as HTMLSelectElement).value)}
          class="ml-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-[10px]"
        >
          {#each stageOptions[p.pipelineId] as s (s.id)}
            <option value={s.id}>{s.name}</option>
          {/each}
        </select>
      {/if}
    </div>
  {/each}
  <div class="relative">
    <button
      type="button"
      onclick={() => (pickerOpen = !pickerOpen)}
      class="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
    >
      <Plus size={10} strokeWidth={2} /> Pipeline
    </button>
    {#if pickerOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="fixed inset-0 z-30"
        onclick={() => (pickerOpen = false)}
      ></div>
      <div class="absolute left-0 top-full z-40 mt-1 w-64 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 shadow-[var(--shadow-lg)]">
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
                  class="flex w-full items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm hover:bg-[var(--color-surface)]"
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
  </div>
</div>
