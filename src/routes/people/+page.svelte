<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Search, Plus, Star, Archive, Tag, X } from 'lucide-svelte';
  import EntityRow from '$lib/components/EntityRow.svelte';
  import RowTagAdder from '$lib/components/RowTagAdder.svelte';
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

  function buildUrl(overrides: Record<string, string | boolean | null>): string {
    const params = new URLSearchParams(page.url.searchParams);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === false || v === '') params.delete(k);
      else params.set(k, v === true ? '1' : v);
    }
    const s = params.toString();
    return s ? `/people?${s}` : '/people';
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      goto(buildUrl({ q: q.trim() }), { replaceState: true, keepFocus: true, noScroll: true });
    }, 200);
  }

  async function patch(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/people/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) {
      toast.danger('Update failed');
      return;
    }
    await invalidateAll();
  }

  async function del(id: string, name: string) {
    const res = await fetch(`/api/people/${id}`, { method: 'DELETE' });
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
      if (e.key === 'j' || e.key === 'ArrowDown') {
        selected = Math.min(rows.length - 1, selected + 1);
        scrollSelectedIntoView();
        return true;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        selected = Math.max(0, selected - 1);
        scrollSelectedIntoView();
        return true;
      }
      if (e.key === 'Enter' || e.key === 'e') {
        const r = rows[selected];
        if (r) goto(`/people/${r.id}`);
        return true;
      }
      if (e.key === '*') {
        const r = rows[selected];
        if (r) patch(r.id, { isFavorite: !r.isFavorite });
        return true;
      }
      if (e.key === '#') {
        const r = rows[selected];
        if (r) patch(r.id, { isArchived: !r.isArchived });
        return true;
      }
    })
  );

  function scrollSelectedIntoView() {
    setTimeout(() => {
      const el = document.querySelectorAll('[data-entity-row]')[selected] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">People</h1>
    <span class="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
      {data.total}
    </span>
    <div class="ml-auto flex items-center gap-2">
      <a
        href="/people/new"
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface)]"
      >
        <Plus size={14} strokeWidth={2} />
        <span>New</span>
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
      placeholder="Search people…"
      class="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm"
    />
  </div>

  <div class="flex flex-wrap items-center gap-2 text-xs">
    <a
      href={buildUrl({ favorite: !data.favorite, archived: data.archived, tag: data.tag?.slug ?? null })}
      class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 {data.favorite
        ? 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]'
        : 'border-[var(--color-border)] text-[var(--color-muted)]'}"
    >
      <Star size={12} strokeWidth={2} fill={data.favorite ? 'currentColor' : 'none'} />
      Favorites
    </a>
    <a
      href={buildUrl({ archived: !data.archived, favorite: data.favorite, tag: data.tag?.slug ?? null })}
      class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 {data.archived
        ? 'border-[var(--color-product-border)] bg-[var(--color-product-bg)] text-[var(--color-product)]'
        : 'border-[var(--color-border)] text-[var(--color-muted)]'}"
    >
      <Archive size={12} strokeWidth={2} />
      Archived
    </a>
    {#if data.tag}
      <a
        href={buildUrl({ tag: null })}
        class="inline-flex items-center gap-1 rounded-full border border-[var(--color-product-border)] bg-[var(--color-product-bg)] px-2.5 py-1 text-[var(--color-product)]"
      >
        <Tag size={12} strokeWidth={2} />
        {data.tag.name}
        <X size={10} strokeWidth={2} />
      </a>
    {:else if data.allTags.length > 0}
      <span class="text-[var(--color-subtle)]">·</span>
      {#each data.allTags.slice(0, 8) as t (t.id)}
        <a
          href={buildUrl({ tag: t.slug })}
          class="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
        >
          <Tag size={12} strokeWidth={2} />
          {t.name}
          <span class="text-[var(--color-subtle)]">{t.count}</span>
        </a>
      {/each}
    {/if}
  </div>

  {#if rows.length === 0}
    <div class="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
      {#if data.q}
        <p class="text-sm text-[var(--color-muted)]">No people match &ldquo;{data.q}&rdquo;.</p>
      {:else if data.tag}
        <p class="text-sm text-[var(--color-muted)]">No people tagged <strong>{data.tag.name}</strong> yet.</p>
        <a href="/people" class="mt-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm">Clear tag filter</a>
      {:else if data.favorite || data.archived}
        <p class="text-sm text-[var(--color-muted)]">No people in this filter.</p>
      {:else}
        <p class="text-sm text-[var(--color-muted)]">Paste a profile link in the topbar to save your first person.</p>
        <a
          href="/people/new"
          class="mt-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-product)] px-3 py-1.5 text-sm font-medium text-white"
        ><Plus size={14} strokeWidth={2} /> Add manually</a>
      {/if}
    </div>
  {:else}
    <ul class="flex flex-col gap-1">
      {#each rows as person, i (person.id)}
        {@const personTags = data.itemTags[person.id] ?? []}
        <li>
          <EntityRow
            href={`/people/${person.id}`}
            name={person.name}
            sub={person.role || person.domain || ''}
            avatarUrl={person.avatarUrl}
            domain={person.domain}
            isFavorite={!!person.isFavorite}
            isArchived={!!person.isArchived}
            parsing={person.source === 'parsing'}
            selected={i === selected}
            onFavorite={() => patch(person.id, { isFavorite: !person.isFavorite })}
            onArchive={() => patch(person.id, { isArchived: !person.isArchived })}
            onDelete={() => del(person.id, person.name)}
          />
          <div class="ml-12 -mt-0.5 flex flex-wrap items-center gap-1 pb-1">
            {#each personTags as t (t.id)}
              <a
                href={buildUrl({ tag: t.slug })}
                class="rounded-full bg-[var(--color-product-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-product)] hover:underline"
              >{t.name}</a>
            {/each}
            <RowTagAdder
              scope="person"
              entityId={person.id}
              currentTags={personTags}
              suggestions={data.allTags}
            />
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
