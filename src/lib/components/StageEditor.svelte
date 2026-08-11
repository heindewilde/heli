<script lang="ts">
  import StageColorPicker from './StageColorPicker.svelte';
  import { invalidateAll } from '$app/navigation';
  import { ArrowUp, ArrowDown, Trash2, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import StageTemplatePicker from './StageTemplatePicker.svelte';
  import { type StageColor } from '$lib/stageColors';
  import type { PipelineStage } from '$lib/server/schema';

  type Props = {
    pipelineId: string;
    stages: PipelineStage[];
    onClose?: () => void;
    /** Reordering and deleting stages are admin-only server-side; renaming and
        recolouring stay open to members. */
    canManage?: boolean;
    /** Attached outreach templates, keyed by stage id. */
    stageTemplates?: Record<string, { id: string; name: string }[]>;
  };

  let { pipelineId, stages, onClose, canManage = true, stageTemplates = {} }: Props = $props();

  let newName = $state('');
  let newColor = $state<StageColor>('gray');
  async function addStage() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch(`/api/pipelines/${pipelineId}/stages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, color: newColor })
    });
    if (!res.ok) { toast.danger('Could not add stage'); return; }
    newName = '';
    newColor = 'gray';
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

  async function setColor(stageId: string, color: StageColor) {
    const res = await fetch(`/api/pipelines/${pipelineId}/stages`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stageId, color })
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
    let res = await fetch(`/api/pipelines/${pipelineId}/stages?stageId=${encodeURIComponent(stageId)}`, {
      method: 'DELETE'
    });
    if (res.status === 409) {
      if (otherStages.length === 0) { toast.danger('Cannot delete the last stage with items'); return; }
      const labels = otherStages.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      const choice = prompt(`"${stageName}" has items. Move them to which stage?\n\n${labels}\n\nEnter the number:`);
      if (!choice) return;
      const n = Number.parseInt(choice, 10);
      if (!Number.isFinite(n) || n < 1 || n > otherStages.length) { toast.danger('Invalid choice'); return; }
      const moveTo = otherStages[n - 1].id;
      res = await fetch(
        `/api/pipelines/${pipelineId}/stages?stageId=${encodeURIComponent(stageId)}&moveTo=${encodeURIComponent(moveTo)}`,
        { method: 'DELETE' }
      );
    }
    if (!res.ok) { toast.danger('Delete failed'); return; }
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
      ><X size={14} strokeWidth={2} /></button>
    {/if}
  </div>

  <div class="flex flex-col gap-1">
    {#each stages as stage, i (stage.id)}
      {@const stageColor = (stage.color ?? 'gray') as StageColor}
      <div class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
        {#if canManage}
          <div class="flex flex-col">
            <button
              type="button"
              onclick={() => moveStage(i, -1)}
              disabled={i === 0}
              class="rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)] disabled:opacity-30"
            ><ArrowUp size={12} strokeWidth={2} /></button>
            <button
              type="button"
              onclick={() => moveStage(i, 1)}
              disabled={i === stages.length - 1}
              class="rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)] disabled:opacity-30"
            ><ArrowDown size={12} strokeWidth={2} /></button>
          </div>
        {/if}
        <input
          value={stage.name}
          onblur={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value;
            if (v !== stage.name) rename(stage.id, v);
          }}
          onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
          class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1 text-sm hover:border-[var(--color-border)] focus:border-[var(--color-highlight-border)] focus:outline-none"
        />
        <StageColorPicker value={stageColor} onChange={(c) => setColor(stage.id, c)} />
        {#if canManage}
          <!-- Attaching templates is board configuration the whole workspace
               then sees, so it sits behind the same gate as reorder and delete. -->
          <StageTemplatePicker
            {pipelineId}
            stageId={stage.id}
            stageName={stage.name}
            attached={stageTemplates[stage.id] ?? []}
          />
          <button
            type="button"
            onclick={() => deleteStage(stage.id, stage.name)}
            class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
          ><Trash2 size={12} strokeWidth={2} /></button>
        {/if}
      </div>
    {/each}

    <!-- New stage row -->
    <div class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-2">
      <div class="invisible flex flex-col">
        <div class="p-0.5"><ArrowUp size={12} strokeWidth={2} /></div>
        <div class="p-0.5"><ArrowDown size={12} strokeWidth={2} /></div>
      </div>
      <input
        bind:value={newName}
        placeholder="New stage…"
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStage(); } }}
        class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
      />
      <StageColorPicker
        value={newColor}
        onChange={(c) => (newColor = c)}
        label="Pick color for new stage"
      />
      <div class="invisible p-1"><Trash2 size={12} strokeWidth={2} /></div>
    </div>
  </div>
</div>
