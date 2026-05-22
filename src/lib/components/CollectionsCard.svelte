<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { FolderOpen, Plus, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import { COLLECTION_ICON_MAP } from '$lib/collectionIcons';
  import type { CollectionMembershipForEntity } from '$lib/server/collections';
  import type { MemberKind } from '$lib/server/schema';

  function iconFor(icon: string | null) {
    if (!icon) return null;
    return COLLECTION_ICON_MAP[icon] ?? null;
  }

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

<div class="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
  <header class="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
    <div class="flex items-center gap-1.5">
      <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Collections</h3>
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
          {@const Ic = iconFor(c.icon)}
          <li class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[var(--color-bg)] {c.isArchived ? 'opacity-60' : ''}">
            {#if Ic}
              <Ic size={12} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
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

  <footer class="relative border-t border-[var(--color-border)]">
    <button
      type="button"
      onclick={() => (pickerOpen = !pickerOpen)}
      class="flex w-full items-center justify-center gap-1.5 rounded-b-[var(--radius-md)] px-3 py-2 text-xs text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
    >
      <Plus size={12} strokeWidth={2} />
      Add to collection
    </button>
    {#if pickerOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="fixed inset-0 z-30" onclick={() => (pickerOpen = false)}></div>
      <div class="absolute bottom-full left-0 right-0 z-40 mb-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 shadow-[var(--shadow-lg)]">
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
                  class="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm hover:bg-[var(--color-surface)]"
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
                  class="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm hover:bg-[var(--color-surface)]"
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
  </footer>
</div>
