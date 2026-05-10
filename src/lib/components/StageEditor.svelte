<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ArrowUp, ArrowDown, Plus, Trash2, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import type { PipelineStage, StageKind } from '$lib/server/schema';

  type Props = {
    pipelineId: string;
    stages: PipelineStage[];
    onClose?: () => void;
  };

  let { pipelineId, stages, onClose }: Props = $props();

  let newName = $state('');
  let newKind = $state<StageKind>('open');

  const STAGE_KIND_OPTIONS: { value: StageKind; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' }
  ];

  async function addStage() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch(`/api/pipelines/${pipelineId}/stages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, kind: newKind })
    });
    if (!res.ok) {
      toast.danger('Could not add stage');
      return;
    }
    newName = '';
    newKind = 'open';
    await invalidateAll();
  }

  async function rename(stageId: string, name: string) {
    const next = name.trim();
    if (!next) return;
    const res = await fetch(`/api/pipelines/${pipelineId}/stages`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stageId, name: next })
    });
    if (!res.ok) toast.danger('Rename failed');
    else await invalidateAll();
  }

  async function setKind(stageId: string, kind: StageKind) {
    const res = await fetch(`/api/pipelines/${pipelineId}/stages`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stageId, kind })
    });
    if (!res.ok) toast.danger('Update failed');
    else await invalidateAll();
  }

  async function moveStage(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= stages.length) return;
    const order = stages.map((s) => s.id);
    [order[idx], order[next]] = [order[next], order[idx]];
    const res = await fetch(`/api/pipelines/${pipelineId}/stages`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order })
    });
    if (!res.ok) toast.danger('Reorder failed');
    else await invalidateAll();
  }

  async function deleteStage(stageId: string, stageName: string) {
    const otherStages = stages.filter((s) => s.id !== stageId);
    let moveTo: string | null = null;

    // Try a no-move delete first; the API responds 409 if items exist.
    let res = await fetch(`/api/pipelines/${pipelineId}/stages?stageId=${encodeURIComponent(stageId)}`, {
      method: 'DELETE'
    });
    if (res.status === 409) {
      if (otherStages.length === 0) {
        toast.danger('Cannot delete the last stage with items');
        return;
      }
      const labels = otherStages.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      const choice = prompt(
        `"${stageName}" has items. Move them to which stage?\n\n${labels}\n\nEnter the number:`
      );
      if (!choice) return;
      const n = Number.parseInt(choice, 10);
      if (!Number.isFinite(n) || n < 1 || n > otherStages.length) {
        toast.danger('Invalid choice');
        return;
      }
      moveTo = otherStages[n - 1].id;
      res = await fetch(
        `/api/pipelines/${pipelineId}/stages?stageId=${encodeURIComponent(stageId)}&moveTo=${encodeURIComponent(moveTo)}`,
        { method: 'DELETE' }
      );
    }
    if (!res.ok) {
      toast.danger('Delete failed');
      return;
    }
    await invalidateAll();
  }
</script>

<div class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-medium">Stages</h3>
    {#if onClose}
      <button
        type="button"
        onclick={onClose}
        title="Close"
        class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-bg)]"
      >
        <X size={14} strokeWidth={2} />
      </button>
    {/if}
  </div>

  <ul class="flex flex-col gap-1">
    {#each stages as stage, i (stage.id)}
      <li class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
        <div class="flex flex-col">
          <button
            type="button"
            onclick={() => moveStage(i, -1)}
            disabled={i === 0}
            title="Move up"
            class="rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)] disabled:opacity-30"
          ><ArrowUp size={12} strokeWidth={2} /></button>
          <button
            type="button"
            onclick={() => moveStage(i, 1)}
            disabled={i === stages.length - 1}
            title="Move down"
            class="rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)] disabled:opacity-30"
          ><ArrowDown size={12} strokeWidth={2} /></button>
        </div>
        <input
          value={stage.name}
          onblur={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value;
            if (v !== stage.name) rename(stage.id, v);
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1 text-sm hover:border-[var(--color-border)] focus:border-[var(--color-highlight-border)] focus:outline-none"
        />
        <select
          value={stage.kind}
          onchange={(e) => setKind(stage.id, (e.currentTarget as HTMLSelectElement).value as StageKind)}
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
        >
          {#each STAGE_KIND_OPTIONS as o (o.value)}
            <option value={o.value}>{o.label}</option>
          {/each}
        </select>
        <button
          type="button"
          onclick={() => deleteStage(stage.id, stage.name)}
          title="Delete stage"
          class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
        >
          <Trash2 size={12} strokeWidth={2} />
        </button>
      </li>
    {/each}
  </ul>

  <form
    onsubmit={(e) => { e.preventDefault(); addStage(); }}
    class="flex items-center gap-2"
  >
    <input
      bind:value={newName}
      placeholder="New stage name…"
      class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
    />
    <select
      bind:value={newKind}
      class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
    >
      {#each STAGE_KIND_OPTIONS as o (o.value)}
        <option value={o.value}>{o.label}</option>
      {/each}
    </select>
    <button
      type="submit"
      class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-2 py-1 text-xs font-medium text-[var(--color-accent-fg)]"
    >
      <Plus size={12} strokeWidth={2} /> Add
    </button>
  </form>
</div>
