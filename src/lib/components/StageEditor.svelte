<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { ArrowUp, ArrowDown, Trash2, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import { STAGE_COLORS, STAGE_COLOR_SWATCH, type StageColor } from '$lib/stageColors';
  import type { PipelineStage } from '$lib/server/schema';

  type Props = {
    pipelineId: string;
    stages: PipelineStage[];
    onClose?: () => void;
    /** Reordering and deleting stages are admin-only server-side; renaming and
        recolouring stay open to members. */
    canManage?: boolean;
  };

  let { pipelineId, stages, onClose, canManage = true }: Props = $props();

  let newName = $state('');
  let newColor = $state<StageColor>('gray');
  let openPicker = $state<string | 'new' | null>(null);

  $effect(() => {
    if (openPicker === null) return;
    const close = () => { openPicker = null; };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  });

  function togglePicker(id: string | 'new') {
    openPicker = openPicker === id ? null : id;
  }

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
        <div class="relative">
          <button
            type="button"
            onclick={() => togglePicker(stage.id)}
            aria-label="Change stage color"
            class="h-4 w-4 rounded-full ring-offset-1 hover:ring-2 hover:ring-[var(--color-border)]"
            style="background-color:{STAGE_COLOR_SWATCH[stageColor]}"
          ></button>
          {#if openPicker === stage.id}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="absolute bottom-full right-0 z-10 mb-1.5 flex gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-1.5 shadow-md"
              onpointerdown={(e) => e.stopPropagation()}
            >
              {#each STAGE_COLORS as c (c)}
                <button
                  type="button"
                  onclick={() => { setColor(stage.id, c); openPicker = null; }}
                  title={c}
                  class="h-4 w-4 rounded-full ring-offset-1 transition-transform hover:scale-110 {stageColor === c ? 'ring-2 ring-[var(--color-text)]' : ''}"
                  style="background-color:{STAGE_COLOR_SWATCH[c]}"
                ></button>
              {/each}
            </div>
          {/if}
        </div>
        {#if canManage}
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
      <div class="relative">
        <button
          type="button"
          onclick={() => togglePicker('new')}
          aria-label="Pick color for new stage"
          class="h-4 w-4 rounded-full ring-offset-1 hover:ring-2 hover:ring-[var(--color-border)]"
          style="background-color:{STAGE_COLOR_SWATCH[newColor]}"
        ></button>
        {#if openPicker === 'new'}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="absolute bottom-full right-0 z-10 mb-1.5 flex gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-1.5 shadow-md"
            onpointerdown={(e) => e.stopPropagation()}
          >
            {#each STAGE_COLORS as c (c)}
              <button
                type="button"
                onclick={() => { newColor = c; openPicker = null; }}
                title={c}
                class="h-4 w-4 rounded-full ring-offset-1 transition-transform hover:scale-110 {newColor === c ? 'ring-2 ring-[var(--color-text)]' : ''}"
                style="background-color:{STAGE_COLOR_SWATCH[c]}"
              ></button>
            {/each}
          </div>
        {/if}
      </div>
      <div class="invisible p-1"><Trash2 size={12} strokeWidth={2} /></div>
    </div>
  </div>
</div>
