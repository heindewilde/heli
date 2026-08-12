<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { FolderOpen, Plus, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import CollectionIcon from '$lib/components/CollectionIcon.svelte';
  import type { CollectionMembershipForEntity } from '$lib/server/collections';
  import type { MemberKind } from '$lib/server/schema';
  import Popover from '$lib/ui/Popover.svelte';
  import Combobox from '$lib/ui/Combobox.svelte';

  type Props = {
    kind: MemberKind;
    refId: string;
    collections: CollectionMembershipForEntity[];
  };

  let { kind, refId, collections }: Props = $props();

  type Candidate = { id: string; name: string; isArchived: number };

  let pickerOpen = $state(false);

  const memberOf = $derived(new Set(collections.map((c) => c.id)));

  async function search(q: string): Promise<Candidate[]> {
    const r = await fetch(
      `/api/collections?mode=typeahead&q=${encodeURIComponent(q)}&limit=20`
    );
    if (!r.ok) return [];
    const data = await r.json();
    return ((data.items ?? []) as Candidate[]).filter(
      (c) => !memberOf.has(c.id) && !c.isArchived
    );
  }

  async function add(collectionId: string) {
    const res = await fetch(`/api/collections/${collectionId}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, refId })
    });
    if (!res.ok) {
      toast.danger('Could not add to collection');
      return;
    }
    pickerOpen = false;
    await invalidateAll();
  }

  async function remove(collectionId: string) {
    const res = await fetch(`/api/collections/${collectionId}/items`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, refId })
    });
    if (!res.ok) {
      toast.danger('Could not remove');
      return;
    }
    await invalidateAll();
  }

  async function createAndAdd(name: string) {
    if (!name) return;
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (!res.ok) {
      toast.danger('Could not create collection');
      return;
    }
    const data = await res.json();
    if (data.id) await add(data.id);
  }
</script>

<div class="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
  <header class="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
    <div class="flex items-center gap-1.5">
      <h3 class="text-sm font-semibold text-[var(--color-text)]">Collections</h3>
      {#if collections.length > 0}
        <span class="rounded-full bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">{collections.length}</span>
      {/if}
    </div>
  </header>

  <div class="flex flex-1 flex-col gap-1 p-2">
    {#if collections.length === 0}
      <div class="flex flex-col items-center gap-1 px-3 py-4 text-center">
        <FolderOpen size={18} strokeWidth={1.5} class="text-[var(--color-subtle)]" />
        <p class="text-xs text-[var(--color-muted)]">Not in any collection</p>
      </div>
    {:else}
      <ul class="flex flex-col">
        {#each collections as c (c.id)}
          <li class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[var(--color-bg)] {c.isArchived ? 'opacity-60' : ''}">
            {#if c.icon}
              <CollectionIcon name={c.icon} size={12} class="text-[var(--color-subtle)]" />
            {:else}
              <FolderOpen size={12} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
            {/if}
            <a href={`/collections/${c.id}`} class="min-w-0 flex-1 truncate text-sm hover:underline">{c.name}</a>
            <button
              type="button"
              onclick={() => remove(c.id)}
              aria-label="Remove from {c.name}"
              class="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] group-hover:opacity-100"
            >
              <X size={11} strokeWidth={2} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <footer class="border-t border-[var(--color-border)]">
    <Popover
      bind:open={pickerOpen}
      label="Add to collection"
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
          Add to collection
        </button>
      {/snippet}

      {#snippet content()}
        <Combobox
          {search}
          getId={(c) => c.id}
          searchOnOpen
          placeholder="Search or create…"
          emptyText="No more collections."
          canCreate={(q, results) =>
            !results.some((c) => c.name.toLowerCase() === q.toLowerCase())}
          createLabel={(q) => `Create \u201c${q}\u201d`}
          onCreate={createAndAdd}
          onSelect={(c) => add(c.id)}
        >
          {#snippet option(c: Candidate)}
            <FolderOpen size={12} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
            <span class="min-w-0 flex-1 truncate">{c.name}</span>
          {/snippet}
        </Combobox>
      {/snippet}
    </Popover>
  </footer>
</div>
