<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Search, Star, Archive, Tag, X, Plus, Loader2 } from 'lucide-svelte';
  import CompanyLogo from '$lib/components/CompanyLogo.svelte';
  import RowTagAdder from '$lib/components/RowTagAdder.svelte';
  import CompanyDetailsCell from '$lib/components/CompanyDetailsCell.svelte';
  import PriorityFlag from '$lib/components/PriorityFlag.svelte';
  import StatusCell from '$lib/components/StatusCell.svelte';
  import PriorityFilterChip from '$lib/components/PriorityFilterChip.svelte';
  import StatusFilterChip from '$lib/components/StatusFilterChip.svelte';
  import SortHeader from '$lib/components/SortHeader.svelte';
  import type { StatusRow } from '$lib/statuses';
  import type { Priority } from '$lib/priority';
  import { bindKeys } from '$lib/keyboard.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { buildUrl as buildUrlBase } from '$lib/url';
  import { formatLastSeen } from '$lib/interactions';
  import { createListCache } from '$lib/client/listCache.svelte';

  let { data } = $props();

  type Row = (typeof data.items)[number];

  // svelte-ignore state_referenced_locally
  let q = $state(data.q);
  let selected = $state(0);
  // svelte-ignore state_referenced_locally
  const cache = createListCache<Row>(data.items);
  $effect(() => {
    cache.hydrate(data.items);
    nextCursor = data.nextCursor;
  });
  const rows = $derived(cache.items);
  let statuses = $derived<StatusRow[]>(data.statuses);

  // svelte-ignore state_referenced_locally
  let nextCursor = $state<string | null>(data.nextCursor);
  let loadingMore = $state(false);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    loadingMore = true;
    try {
      const res = await fetch(`/api/companies/list?cursor=${encodeURIComponent(nextCursor)}`);
      if (!res.ok) { toast.danger('Could not load more'); return; }
      const body = (await res.json()) as { items: Row[]; nextCursor: string | null };
      cache.appendMany(body.items);
      nextCursor = body.nextCursor;
    } catch {
      toast.danger('Could not load more');
    } finally {
      loadingMore = false;
    }
  }

  let showAdd = $state(false);
  let addName = $state('');
  let addBusy = $state(false);
  let addInputEl = $state<HTMLInputElement | undefined>(undefined);

  function openAdd() {
    showAdd = true;
    setTimeout(() => addInputEl?.focus(), 0);
  }

  async function submitAdd() {
    const name = addName.trim();
    if (!name || addBusy) return;
    addBusy = true;
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) { toast.danger('Could not create'); return; }
      addName = '';
      showAdd = false;
      await invalidateAll();
    } catch {
      toast.danger('Could not create');
    } finally {
      addBusy = false;
    }
  }

  $effect(() => {
    if (selected >= rows.length) selected = Math.max(0, rows.length - 1);
  });

  function buildUrl(overrides: Record<string, string | boolean | null>): string {
    return buildUrlBase('/companies', page.url.searchParams, overrides);
  }

  function navTo(overrides: Record<string, string | boolean | null>) {
    goto(buildUrl(overrides), { replaceState: true, keepFocus: true, noScroll: true });
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => navTo({ q: q.trim() }), 200);
  }

  async function patch(id: string, body: Record<string, unknown>, optimistic?: Partial<Row>) {
    const rollback = cache.patch(id, (optimistic ?? body) as Partial<Row>);
    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        rollback();
        toast.danger('Update failed');
      }
    } catch {
      rollback();
      toast.danger('Update failed');
    }
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
        if (r) goto(`/companies/${r.id}`);
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

  function sortHref(key: string): string {
    return buildUrl({ sort: key === data.sort ? null : key });
  }

  function onPriorityFilter(next: (Priority)[] | null) {
    if (!next) {
      navTo({ priority: null });
      return;
    }
    const enc = next.map((p) => (p == null ? 'none' : String(p))).join(',');
    navTo({ priority: enc });
  }
  function onStatusFilter(next: string[] | null) {
    if (!next) {
      navTo({ status: null });
      return;
    }
    navTo({ status: next.join(',') });
  }

  const priorityFilter = $derived<Priority[] | null>(data.priorityFilter as Priority[] | null);

  async function setStatus(id: string, next: StatusRow | null) {
    await patch(id, { statusId: next?.id ?? null });
  }
  async function setPriority(id: string, next: Priority) {
    await patch(id, { priority: next });
  }

  async function saveDetails(id: string, next: { sector: string | null; size: string | null }) {
    await patch(id, { industry: next.sector, sizeBand: next.size });
  }

</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">Companies</h1>
    <span class="tabular rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
      {data.total}
    </span>
    <div class="ml-auto flex items-center gap-1.5">
      {#if showAdd}
        <input
          bind:this={addInputEl}
          bind:value={addName}
          type="text"
          placeholder="Name…"
          onkeydown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submitAdd(); }
            if (e.key === 'Escape') { showAdd = false; addName = ''; }
          }}
          onblur={() => { if (!addName.trim()) showAdd = false; }}
          disabled={addBusy}
          class="h-7 w-36 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm outline-none focus:border-[var(--color-border-strong)]"
        />
      {:else}
        <button
          type="button"
          onclick={openAdd}
          class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          <Plus size={14} strokeWidth={2} />
          Add company
        </button>
      {/if}
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
      placeholder="Search companies…"
      class="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm shadow-[var(--shadow-xs)] transition-[border-color,box-shadow] focus:border-[var(--color-border-strong)] focus:shadow-[var(--shadow-sm)] focus:outline-none"
    />
  </div>

  <div class="flex flex-wrap items-center gap-2 text-xs">
    <a
      href={buildUrl({ favorite: !data.favorite, archived: data.archived, tag: data.tag?.slug ?? null })}
      class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors {data.favorite
        ? 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]'
        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}"
    >
      <Star size={12} strokeWidth={2} fill={data.favorite ? 'currentColor' : 'none'} />
      Favorites
    </a>
    <a
      href={buildUrl({ archived: !data.archived, favorite: data.favorite, tag: data.tag?.slug ?? null })}
      class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors {data.archived
        ? 'border-[var(--color-border-strong)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}"
    >
      <Archive size={12} strokeWidth={2} />
      Archived
    </a>
    <PriorityFilterChip selected={priorityFilter} onChange={onPriorityFilter} />
    <StatusFilterChip {statuses} selected={data.statusFilter} onChange={onStatusFilter} />
    {#if data.tag}
      <a
        href={buildUrl({ tag: null })}
        class="inline-flex items-center gap-1 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-highlight-bg)] px-2.5 py-1 text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
      >
        <Tag size={12} strokeWidth={2} />
        {data.tag.name}
        <X size={10} strokeWidth={2} />
      </a>
    {:else if data.allTags.length > 0}
      <span class="text-[var(--color-subtle)]">·</span>
      {#each data.allTags.slice(0, 6) as t (t.id)}
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
        <p class="text-sm text-[var(--color-muted)]">No companies match &ldquo;{data.q}&rdquo;.</p>
      {:else if data.tag}
        <p class="text-sm text-[var(--color-muted)]">No companies tagged <strong>{data.tag.name}</strong> yet.</p>
        <a href="/companies" class="mt-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm">Clear tag filter</a>
      {:else if data.favorite || data.archived || data.priorityFilter || data.statusFilter}
        <p class="text-sm text-[var(--color-muted)]">No companies in this filter.</p>
      {:else}
        <p class="text-sm text-[var(--color-muted)]">Paste a website link in the topbar, or use <strong>Add company</strong> above to add one.</p>
      {/if}
    </div>
  {:else}
    <div class="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]">
      <div
        class="hidden md:grid items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[var(--color-subtle)]"
        style="grid-template-columns: 24px minmax(0,2fr) minmax(0,1.3fr) 160px minmax(0,1.2fr);"
      >
        <span class="cap-label">·</span>
        <SortHeader label="Name" sortKey="name" current={data.sort} href={sortHref} direction="asc" />
        <SortHeader label="Details" sortKey="details" current={data.sort} href={sortHref} sortable={false} />
        <SortHeader label="Activity" sortKey="lastInteraction" current={data.sort} href={sortHref} />
        <SortHeader label="Tags" sortKey="tags" current={data.sort} href={sortHref} sortable={false} />
      </div>

      <ul role="list">
        {#each rows as company, i (company.id)}
          {@const tags = data.itemTags[company.id] ?? []}
          {@const sel = i === selected}
          <li data-entity-row>
            <!-- Mobile card (< md) -->
            <div class="md:hidden group relative flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-3 transition-colors last:border-b-0 {sel ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-row-hover)]'} {company.isArchived ? 'opacity-60' : ''}">
              <PriorityFlag value={(company.priority as Priority) ?? null} onChange={(p) => setPriority(company.id, p)} />
              <a href={`/companies/${company.id}`} class="flex min-w-0 flex-1 items-center gap-3">
                <CompanyLogo domain={company.domain} fallbackUrl={company.logoUrl ?? company.faviconUrl} name={company.name} size={36} />
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <span class="truncate text-sm font-medium text-[var(--color-text)]">{company.name}</span>
                    {#if company.isFavorite}
                      <Star size={11} strokeWidth={2} fill="currentColor" class="shrink-0 text-[var(--color-warning)]" />
                    {/if}
                  </span>
                  {#if company.domain}
                    <span class="block truncate text-xs text-[var(--color-muted)]">{company.domain}</span>
                  {/if}
                </span>
              </a>
              <StatusCell value={company.statusId} statuses={statuses} scope="company" onChange={(s) => setStatus(company.id, s)} onStatusesChange={(next) => (statuses = next)} />
            </div>
            <!-- Desktop row (>= md) -->
            <div
              class="group relative hidden md:grid items-center gap-4 border-b border-[var(--color-border)] px-3 transition-colors last:border-b-0 {sel ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-row-hover)]'} {company.isArchived ? 'opacity-60' : ''}"
              style="grid-template-columns: 24px minmax(0,2fr) minmax(0,1.3fr) 160px minmax(0,1.2fr); min-height: 56px; padding-top: 8px; padding-bottom: 8px;"
            >
              <PriorityFlag
                value={(company.priority as Priority) ?? null}
                onChange={(p) => setPriority(company.id, p)}
              />

              <a href={`/companies/${company.id}`} class="flex min-w-0 items-center gap-3">
                <CompanyLogo
                  domain={company.domain}
                  fallbackUrl={company.logoUrl ?? company.faviconUrl}
                  name={company.name}
                  size={36}
                />
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-[var(--color-text)]">{company.name}</span>
                    {#if company.source === 'parsing'}
                      <Loader2 size={11} strokeWidth={2} class="animate-spin text-[var(--color-subtle)]" />
                    {/if}
                    {#if company.isFavorite}
                      <Star size={11} strokeWidth={2} fill="currentColor" class="text-[var(--color-warning)]" />
                    {/if}
                  </span>
                  {#if company.domain}
                    <span class="block truncate text-xs text-[var(--color-muted)]">{company.domain}</span>
                  {/if}
                </span>
              </a>

              <CompanyDetailsCell
                sector={company.industry}
                size={company.sizeBand}
                onSave={(next) => saveDetails(company.id, next)}
              />

              <div class="flex min-w-0 flex-col gap-0.5">
                <StatusCell
                  value={company.statusId}
                  statuses={statuses}
                  scope="company"
                  onChange={(s) => setStatus(company.id, s)}
                  onStatusesChange={(next) => (statuses = next)}
                />
                {#if company.lastAt}
                  <span class="tabular pl-1 text-xs text-[var(--color-subtle)]">{formatLastSeen(company.lastAt)}</span>
                {/if}
              </div>

              <div class="flex min-w-0 flex-wrap items-center gap-1">
                {#each tags as t (t.id)}
                  <a
                    href={buildUrl({ tag: t.slug })}
                    class="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                  >{t.name}</a>
                {/each}
                <RowTagAdder
                  scope="company"
                  entityId={company.id}
                  currentTags={tags}
                  suggestions={data.allTags}
                  revealOnHover
                />
              </div>
            </div>
          </li>
        {/each}
      </ul>
    </div>
    {#if nextCursor}
      <div class="flex justify-center">
        <button
          type="button"
          onclick={loadMore}
          disabled={loadingMore}
          class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] disabled:opacity-60"
        >
          {#if loadingMore}
            <Loader2 size={12} strokeWidth={2} class="animate-spin" />
            Loading…
          {:else}
            Load more
          {/if}
        </button>
      </div>
    {/if}
  {/if}

  <p class="hidden sm:block text-[11px] text-[var(--color-subtle)]">
    Tip: <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">j/k</kbd> navigate ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">↵</kbd> open ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">*</kbd> favorite ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">#</kbd> archive
  </p>
</div>
