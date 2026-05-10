<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { FolderOpen, Plus, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import type { CollectionMembershipForEntity } from '$lib/server/collections';
  import type { MemberKind } from '$lib/server/schema';

  type Props = {
    kind: MemberKind;
    refId: string;
    collections: CollectionMembershipForEntity[];
  };

  let { kind, refId, collections }: Props = $props();

  let pickerOpen = $state(false);
  let pickerQuery = $state('');
  let candidates = $state<{ id: string; name: string; isArchived: number }[]>([]);
  let loading = $state(false);

  const memberOf = $derived(new Set(collections.map((c) => c.id)));
  const filtered = $derived(candidates.filter((c) => !memberOf.has(c.id) && !c.isArchived));

  async function loadCandidates() {
    loading = true;
    try {
      const r = await fetch(`/api/collections?mode=typeahead&q=${encodeURIComponent(pickerQuery)}&limit=20`);
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
    pickerQuery = '';
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

  async function createAndAdd() {
    const name = pickerQuery.trim();
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

<div class="flex flex-wrap items-center gap-1.5">
  {#each collections as c (c.id)}
    <a
      href={`/collections/${c.id}`}
      class="group inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)] hover:border-[var(--color-product-border)] {c.isArchived ? 'opacity-60' : ''}"
    >
      <FolderOpen size={10} strokeWidth={2} />
      <span>{c.name}</span>
      <button
        type="button"
        onclick={(e) => { e.preventDefault(); remove(c.id); }}
        aria-label="Remove from {c.name}"
        class="rounded-full p-0.5 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-bg)] group-hover:opacity-100"
      >
        <X size={10} strokeWidth={2} />
      </button>
    </a>
  {/each}
  <div class="relative">
    <button
      type="button"
      onclick={() => (pickerOpen = !pickerOpen)}
      class="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
    >
      <Plus size={10} strokeWidth={2} /> Collection
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
          placeholder="Search or create…"
          class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
        />
        <ul class="mt-1 max-h-60 overflow-y-auto">
          {#if loading}
            <li class="px-2 py-1 text-xs italic text-[var(--color-subtle)]">Loading…</li>
          {:else}
            {#each filtered as c (c.id)}
              <li>
                <button
                  type="button"
                  onclick={() => add(c.id)}
                  class="flex w-full items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm hover:bg-[var(--color-surface)]"
                >
                  <FolderOpen size={12} strokeWidth={2} class="text-[var(--color-subtle)]" />
                  <span class="truncate">{c.name}</span>
                </button>
              </li>
            {/each}
            {#if pickerQuery.trim() && !filtered.some((c) => c.name.toLowerCase() === pickerQuery.trim().toLowerCase())}
              <li>
                <button
                  type="button"
                  onclick={createAndAdd}
                  class="flex w-full items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm hover:bg-[var(--color-surface)]"
                >
                  <Plus size={12} strokeWidth={2} class="text-[var(--color-subtle)]" />
                  <span>Create &ldquo;{pickerQuery.trim()}&rdquo;</span>
                </button>
              </li>
            {/if}
            {#if filtered.length === 0 && !pickerQuery.trim()}
              <li class="px-2 py-1 text-xs italic text-[var(--color-subtle)]">No more collections.</li>
            {/if}
          {/if}
        </ul>
      </div>
    {/if}
  </div>
</div>
