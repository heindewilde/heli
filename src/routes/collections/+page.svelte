<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Search, Plus, ArrowDownUp } from 'lucide-svelte';
  import CollectionCard from '$lib/components/CollectionCard.svelte';
  import { bindKeys } from '$lib/keyboard.svelte';
  import { toast } from '$lib/toasts.svelte';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let q = $state(data.q);
  let selected = $state(0);
  let rows = $derived(data.items);

  $effect(() => {
    if (selected >= rows.length) selected = Math.max(0, rows.length - 1);
  });

  function buildUrl(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams(page.url.searchParams);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/collections?${s}` : '/collections';
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      goto(buildUrl({ q: q.trim() || null }), { replaceState: true, keepFocus: true, noScroll: true });
    }, 200);
  }

  async function archive(id: string, name: string, isArchived: number) {
    const res = await fetch(`/api/collections/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isArchived: !isArchived })
    });
    if (!res.ok) {
      toast.danger('Update failed');
      return;
    }
    toast.success(isArchived ? `Restored ${name}` : `Archived ${name}`);
    await invalidateAll();
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete collection "${name}"? Members are not deleted; only the grouping goes away.`)) return;
    const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.danger('Delete failed');
      return;
    }
    toast.success(`Deleted ${name}`);
    await invalidateAll();
  }

  onMount(() =>
    bindKeys((e) => {
      if (rows.length === 0) return;
      if (e.key === 'Enter' || e.key === 'e') {
        const r = rows[selected];
        if (r) goto(`/collections/${r.id}`);
        return true;
      }
      if (e.key === '#') {
        const r = rows[selected];
        if (r) archive(r.id, r.name, r.isArchived);
        return true;
      }
    })
  );

  const ARCHIVED_FILTERS = [
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
    { value: 'all', label: 'All' }
  ] as const;
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">Collections</h1>
    <span class="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
      {data.total}
    </span>
    <div class="ml-auto flex items-center gap-2">
      <label class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-2 pr-1 text-sm text-[var(--color-muted)]">
        <ArrowDownUp size={14} strokeWidth={2} class="text-[var(--color-subtle)]" />
        <span class="sr-only">Sort by</span>
        <select
          value={data.sort}
          onchange={(e) => goto(buildUrl({ sort: (e.currentTarget as HTMLSelectElement).value }), { replaceState: true, keepFocus: true, noScroll: true })}
          class="bg-transparent py-2 pl-1 pr-1 text-sm outline-none"
        >
          <option value="updated">Recently updated</option>
          <option value="recent">Recently added</option>
          <option value="name">Name</option>
        </select>
      </label>
      <a
        href="/collections/new"
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)]"
      >
        <Plus size={14} strokeWidth={2} />
        New collection
      </a>
    </div>
  </header>

  <div class="relative">
    <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-subtle)]">
      <Search size={14} strokeWidth={2} />
    </span>
    <input
      data-search-input
      bind:value={q}
      oninput={onSearchInput}
      type="search"
      placeholder="Search collections…"
      class="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm"
    />
  </div>

  <div class="flex flex-wrap items-center gap-2 text-xs">
    {#each ARCHIVED_FILTERS as f (f.value)}
      <a
        href={buildUrl({ archived: f.value === 'active' ? null : f.value })}
        class="rounded-full border px-2.5 py-1 {data.archived === f.value
          ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
          : 'border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface)]'}"
      >{f.label}</a>
    {/each}
  </div>

  {#if rows.length === 0}
    <div class="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
      {#if data.q}
        <p class="text-sm text-[var(--color-muted)]">No collections match &ldquo;{data.q}&rdquo;.</p>
      {:else if data.archived !== 'active'}
        <p class="text-sm text-[var(--color-muted)]">No {data.archived} collections.</p>
      {:else}
        <p class="text-sm text-[var(--color-muted)]">No collections yet — group people and companies into named lists.</p>
        <a
          href="/collections/new"
          class="mt-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)]"
        ><Plus size={14} strokeWidth={2} /> New collection</a>
      {/if}
    </div>
  {:else}
    <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {#each rows as c, i (c.id)}
        <li>
          <CollectionCard
            href={`/collections/${c.id}`}
            name={c.name}
            description={c.description}
            icon={c.icon}
            isArchived={!!c.isArchived}
            peopleCount={c.peopleCount}
            companyCount={c.companyCount}
            onArchive={() => archive(c.id, c.name, c.isArchived)}
            onDelete={() => del(c.id, c.name)}
            onCreatePipeline={() => goto(`/pipelines/new?fromCollection=${c.id}`)}
          />
        </li>
      {/each}
    </ul>
  {/if}
</div>
