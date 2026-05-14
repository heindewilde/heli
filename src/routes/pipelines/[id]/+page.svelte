<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { Trash2, Archive, Funnel, Folder, Settings, LayoutGrid, List as ListIcon } from 'lucide-svelte';
  import NotesEditor from '$lib/components/NotesEditor.svelte';
  import PipelineAddPicker from '$lib/components/PipelineAddPicker.svelte';
  import PipelineBoard from '$lib/components/PipelineBoard.svelte';
  import PipelineList from '$lib/components/PipelineList.svelte';
  import StageEditor from '$lib/components/StageEditor.svelte';
  import { toast } from '$lib/toasts.svelte';
  import type { PipelineView } from '$lib/server/schema';

  let { data } = $props();
  const pipeline = $derived(data.pipeline);
  const sync = $derived(data.sync);

  async function disconnectSync() {
    if (!sync) return;
    const res = await fetch(`/api/collections/${sync.collectionId}/sync`, { method: 'DELETE' });
    if (!res.ok) { toast.danger('Disconnect failed'); return; }
    await invalidateAll();
    toast.success('Sync disconnected');
  }

  let editingName = $state(false);
  // svelte-ignore state_referenced_locally
  let nameDraft = $state(pipeline.name);
  let nameInput = $state<HTMLInputElement | undefined>(undefined);
  let deleting = $state(false);

  // svelte-ignore state_referenced_locally
  let view = $state<PipelineView>(pipeline.defaultView as PipelineView);
  let stageEditorOpen = $state(false);

async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/pipelines/${pipeline.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      if (!deleting) toast.danger('Update failed');
      return false;
    }
    if (!deleting) await invalidateAll();
    return true;
  }

  async function commitName() {
    if (!editingName) return;
    const next = nameDraft.trim();
    editingName = false;
    if (!next || next === pipeline.name) return;
    await patch({ name: next });
  }

  function startEditingName() {
    nameDraft = pipeline.name;
    editingName = true;
    setTimeout(() => nameInput?.focus(), 0);
  }

  async function toggleArchive() {
    await patch({ isArchived: !pipeline.isArchived });
  }

  async function setView(next: PipelineView) {
    view = next;
    // Persist as the new default so it survives reloads.
    await patch({ defaultView: next });
  }

  async function del() {
    if (!confirm(`Delete pipeline "${pipeline.name}"? Items and stage history are removed; people and companies are not affected.`)) return;
    deleting = true;
    const res = await fetch(`/api/pipelines/${pipeline.id}`, { method: 'DELETE' });
    if (!res.ok) {
      deleting = false;
      toast.danger('Delete failed');
      return;
    }
    toast.success(`Deleted ${pipeline.name}`);
    goto('/pipelines');
  }

  async function addItem(kind: 'person' | 'company', refId: string) {
    const res = await fetch(`/api/pipelines/${pipeline.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, refId })
    });
    if (!res.ok) {
      toast.danger('Could not add');
      return;
    }
    await invalidateAll();
  }
  async function removeItem(itemId: string) {
    if (!confirm('Remove this item from the pipeline? Stage history will be lost.')) return;
    const res = await fetch(`/api/pipelines/${pipeline.id}/items?itemId=${encodeURIComponent(itemId)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      toast.danger('Could not remove');
      return;
    }
    await invalidateAll();
  }

  const totalItems = $derived(pipeline.items.length);
  const openItems = $derived(
    pipeline.items.filter((i) => {
      const s = pipeline.stages.find((s) => s.id === i.stageId);
      return s?.kind === 'open';
    }).length
  );
  const wonItems = $derived(
    pipeline.items.filter((i) => {
      const s = pipeline.stages.find((s) => s.id === i.stageId);
      return s?.kind === 'won';
    }).length
  );
  const lostItems = $derived(
    pipeline.items.filter((i) => {
      const s = pipeline.stages.find((s) => s.id === i.stageId);
      return s?.kind === 'lost';
    }).length
  );
</script>

<article class="flex flex-col gap-4">
  {#if data.justSaved}
    <div class="rounded-[var(--radius-sm)] border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-3 py-2 text-sm text-[var(--color-text)]">
      Saved &ldquo;{pipeline.name}&rdquo;. Add people or companies to start populating stages.
    </div>
  {/if}

  <header class="flex items-start gap-4">
    <span class="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
      <Funnel size={16} strokeWidth={2} />
    </span>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        {#if editingName}
          <input
            bind:this={nameInput}
            bind:value={nameDraft}
            onblur={commitName}
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitName(); }
              if (e.key === 'Escape') { editingName = false; nameDraft = pipeline.name; }
            }}
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-2xl font-semibold tracking-tight"
          />
        {:else}
          <button
            type="button"
            onclick={startEditingName}
            class="rounded-[var(--radius-sm)] px-1 -mx-1 text-2xl font-semibold tracking-tight hover:bg-[var(--color-surface)]"
          >{pipeline.name}</button>
        {/if}
        {#if pipeline.isArchived}
          <span class="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">archived</span>
        {/if}
      </div>
      <p class="mt-1 text-sm text-[var(--color-muted)]">
        {totalItems} {totalItems === 1 ? 'item' : 'items'}
        · {openItems} open
        · {wonItems} won
        · {lostItems} lost
      </p>
    </div>
    <div class="flex items-center gap-1">
      <div class="mr-1 inline-flex overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]">
        <button
          type="button"
          onclick={() => setView('kanban')}
          title="Kanban view"
          class="inline-flex items-center gap-1 px-2 py-1.5 text-xs {view === 'kanban' ? 'bg-[var(--color-highlight-bg)] text-[var(--color-text)]' : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)]'}"
        ><LayoutGrid size={12} strokeWidth={2} /> Kanban</button>
        <button
          type="button"
          onclick={() => setView('list')}
          title="List view"
          class="inline-flex items-center gap-1 px-2 py-1.5 text-xs {view === 'list' ? 'bg-[var(--color-highlight-bg)] text-[var(--color-text)]' : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)]'}"
        ><ListIcon size={12} strokeWidth={2} /> List</button>
      </div>
      <button
        type="button"
        title="Edit stages"
        onclick={() => (stageEditorOpen = !stageEditorOpen)}
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)] {stageEditorOpen ? 'bg-[var(--color-surface)] text-[var(--color-text)]' : ''}"
      ><Settings size={16} strokeWidth={2} /></button>
      <button
        type="button"
        title={pipeline.isArchived ? 'Unarchive' : 'Archive'}
        onclick={toggleArchive}
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
      ><Archive size={16} strokeWidth={2} /></button>
      <button
        type="button"
        title="Delete"
        onclick={del}
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
      ><Trash2 size={16} strokeWidth={2} /></button>
    </div>
  </header>

  {#if sync}
    <div class="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-3 py-2 text-xs">
      <Folder size={12} strokeWidth={2} class="shrink-0 text-[var(--color-muted)]" />
      <span class="text-[var(--color-muted)]">
        Synced with collection
        <a href={`/collections/${sync.collectionId}`} class="font-medium text-[var(--color-text)] underline underline-offset-2 hover:opacity-80">{sync.collectionName}</a>
        — members are mirrored automatically.
      </span>
      <button
        type="button"
        onclick={disconnectSync}
        class="ml-auto shrink-0 text-[var(--color-subtle)] underline underline-offset-2 hover:text-[var(--color-danger)]"
      >Disconnect</button>
    </div>
  {/if}

  {#if pipeline.description !== null && pipeline.description !== undefined || true}
    <div class="flex flex-col gap-2">
      <h2 class="sr-only">Description</h2>
      <NotesEditor
        value={pipeline.description}
        placeholder="Describe this pipeline (optional)…"
        onSave={async (next) => { await patch({ description: next }); }}
      />
    </div>
  {/if}

  {#if stageEditorOpen}
    <StageEditor pipelineId={pipeline.id} stages={pipeline.stages} onClose={() => (stageEditorOpen = false)} />
  {/if}

  {#if pipeline.stages.length === 0}
    <div class="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center text-sm text-[var(--color-muted)]">
      This pipeline has no stages yet. Open the gear icon to add some.
    </div>
  {:else}
    <div class="w-72">
      <PipelineAddPicker onAdd={addItem} />
    </div>
    {#if view === 'kanban'}
      <PipelineBoard {pipeline} onRemoveItem={removeItem} />
    {:else}
      <PipelineList {pipeline} onRemoveItem={removeItem} />
    {/if}
  {/if}
</article>
