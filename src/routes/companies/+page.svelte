<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Search, Star, Archive, Tag, X, Rows3, Rows4, Loader2, Building2 } from 'lucide-svelte';
  import RowTagAdder from '$lib/components/RowTagAdder.svelte';
  import PriorityFlag from '$lib/components/PriorityFlag.svelte';
  import StatusCell from '$lib/components/StatusCell.svelte';
  import PriorityFilterChip from '$lib/components/PriorityFilterChip.svelte';
  import StatusFilterChip from '$lib/components/StatusFilterChip.svelte';
  import SortHeader from '$lib/components/SortHeader.svelte';
  import InlineCreateRow from '$lib/components/InlineCreateRow.svelte';
  import type { StatusRow } from '$lib/statuses';
  import type { Priority } from '$lib/priority';
  import { bindKeys } from '$lib/keyboard.svelte';
  import { toast } from '$lib/toasts.svelte';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let q = $state(data.q);
  let selected = $state(0);
  let rows = $derived(data.items);
  // svelte-ignore state_referenced_locally
  let statuses = $state<StatusRow[]>(data.statuses);
  $effect(() => {
    statuses = data.statuses;
  });

  const DENSITY_KEY = 'gusto.companies.density';
  let density = $state<'comfortable' | 'compact'>('comfortable');
  onMount(() => {
    const stored = localStorage.getItem(DENSITY_KEY);
    if (stored === 'compact' || stored === 'comfortable') density = stored;
  });
  $effect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DENSITY_KEY, density);
  });

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
    return s ? `/companies?${s}` : '/companies';
  }

  function navTo(overrides: Record<string, string | boolean | null>) {
    goto(buildUrl(overrides), { replaceState: true, keepFocus: true, noScroll: true });
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => navTo({ q: q.trim() }), 200);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/companies/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      toast.danger('Update failed');
      return;
    }
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

  function formatLastSeen(ts: number | null): string {
    if (ts == null) return '';
    const days = Math.floor((Date.now() - ts) / 86_400_000);
    if (days <= 0) return 'today';
    if (days < 7) return `${days}d`;
    if (days < 30) return `${Math.floor(days / 7)}w`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
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

  const priorityFilter = $derived<Priority[] | null>(
    data.priorityFilter
      ? (data.priorityFilter as (number | null)[]).map((v) => (v === 1 || v === 2 || v === 3 ? v : null)) as Priority[]
      : null
  );

  let optimisticStatus = $state<Record<string, string | null>>({});
  async function setStatus(id: string, next: StatusRow | null) {
    optimisticStatus[id] = next?.id ?? null;
    await patch(id, { statusId: next?.id ?? null });
    delete optimisticStatus[id];
  }
  async function setPriority(id: string, next: Priority) {
    await patch(id, { priority: next });
  }

  // Inline-edit for the size field: small popover via prompt. Replace with a
  // proper editor later — for now a quick text edit is enough to unblock the
  // database feel.
  async function editSize(id: string, current: string | null) {
    const next = window.prompt('Company size (e.g. 1-10, 10-50, 50-200, 200-1000, 1000+)', current ?? '');
    if (next === null) return;
    await patch(id, { sizeBand: next.trim() || null });
  }
  async function editSector(id: string, current: string | null) {
    const next = window.prompt('Sector / industry', current ?? '');
    if (next === null) return;
    await patch(id, { industry: next.trim() || null });
  }

  async function onCreated(_id: string) {
    await invalidateAll();
  }
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">Companies</h1>
    <span class="tabular rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
      {data.total}
    </span>
    <div class="ml-auto flex items-center gap-1.5">
      <button
        type="button"
        title={density === 'compact' ? 'Comfortable density' : 'Compact density'}
        aria-label="Toggle density"
        onclick={() => (density = density === 'compact' ? 'comfortable' : 'compact')}
        class="inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 text-[var(--color-subtle)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
      >
        {#if density === 'compact'}
          <Rows3 size={14} strokeWidth={2} />
        {:else}
          <Rows4 size={14} strokeWidth={2} />
        {/if}
      </button>
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

  <InlineCreateRow placeholder="Add a company…" endpoint="/api/companies" onCreated={onCreated} />

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
        <p class="text-sm text-[var(--color-muted)]">Paste a website link in the topbar, or type a name above to add one.</p>
      {/if}
    </div>
  {:else}
    <div class="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]">
      <div
        class="grid items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-2 text-[var(--color-subtle)]"
        style="grid-template-columns: 28px minmax(0,1.4fr) minmax(0,1fr) 96px 84px minmax(0,140px) minmax(0,1fr);"
      >
        <span class="cap-label">·</span>
        <SortHeader label="Name" sortKey="name" current={data.sort} href={sortHref} direction="asc" />
        <SortHeader label="Sector" sortKey="sector" current={data.sort} href={sortHref} sortable={false} />
        <SortHeader label="Size" sortKey="size" current={data.sort} href={sortHref} sortable={false} align="right" />
        <SortHeader label="Last seen" sortKey="lastInteraction" current={data.sort} href={sortHref} align="right" />
        <SortHeader label="Status" sortKey="status" current={data.sort} href={sortHref} />
        <SortHeader label="Tags" sortKey="tags" current={data.sort} href={sortHref} sortable={false} />
      </div>

      <ul role="list">
        {#each rows as company, i (company.id)}
          {@const tags = data.itemTags[company.id] ?? []}
          {@const currentStatusId = optimisticStatus[company.id] !== undefined ? optimisticStatus[company.id] : company.statusId}
          {@const sel = i === selected}
          <li>
            <div
              data-entity-row
              class="group grid items-center gap-2 border-b border-[var(--color-border)] px-2 transition-colors last:border-b-0 hover:bg-[var(--color-surface-2)] {sel ? 'bg-[var(--color-highlight-bg)]' : ''} {company.isArchived ? 'opacity-60' : ''}"
              style="grid-template-columns: 28px minmax(0,1.4fr) minmax(0,1fr) 96px 84px minmax(0,140px) minmax(0,1fr); {density === 'compact' ? 'min-height: 36px; padding-top: 2px; padding-bottom: 2px;' : 'min-height: 52px; padding-top: 6px; padding-bottom: 6px;'}"
            >
              <!-- Priority -->
              <div class="flex justify-center">
                <PriorityFlag
                  value={(company.priority as Priority) ?? null}
                  onChange={(p) => setPriority(company.id, p)}
                />
              </div>

              <!-- Identity: square logo + name + domain -->
              <a href={`/companies/${company.id}`} class="flex min-w-0 items-center gap-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-muted)]">
                  {#if company.logoUrl || company.faviconUrl}
                    <img src={company.logoUrl ?? company.faviconUrl ?? ''} alt="" loading="lazy" class="h-full w-full object-cover" />
                  {:else}
                    <Building2 size={14} strokeWidth={2} />
                  {/if}
                </span>
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
                  {#if density === 'comfortable' && company.domain}
                    <span class="block truncate text-xs text-[var(--color-muted)]">{company.domain}</span>
                  {/if}
                </span>
              </a>

              <!-- Sector (inline-editable via prompt for now) -->
              <button
                type="button"
                onclick={() => editSector(company.id, company.industry)}
                class="min-w-0 cursor-pointer truncate rounded-[var(--radius-sm)] px-1 py-0.5 text-left text-xs text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
              >
                {#if company.industry}
                  <span class="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px]">{company.industry}</span>
                {:else}
                  <span class="invisible text-[var(--color-subtle)] group-hover:visible">— sector</span>
                {/if}
              </button>

              <!-- Size: tabular, right-aligned -->
              <button
                type="button"
                onclick={() => editSize(company.id, company.sizeBand)}
                class="tabular cursor-pointer rounded-[var(--radius-sm)] px-1 py-0.5 text-right text-xs text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
              >
                {#if company.sizeBand}
                  {company.sizeBand}
                {:else}
                  <span class="invisible text-[var(--color-subtle)] group-hover:visible">—</span>
                {/if}
              </button>

              <!-- Last seen -->
              <div class="tabular text-right text-xs text-[var(--color-muted)]">
                {formatLastSeen(company.lastAt)}
              </div>

              <!-- Status -->
              <div class="min-w-0">
                <StatusCell
                  value={currentStatusId}
                  statuses={statuses}
                  scope="company"
                  onChange={(s) => setStatus(company.id, s)}
                  onStatusesChange={(next) => (statuses = next)}
                />
              </div>

              <!-- Tags -->
              <div class="flex min-w-0 flex-wrap items-center gap-1">
                {#each tags as t (t.id)}
                  <a
                    href={buildUrl({ tag: t.slug })}
                    class="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                  >{t.name}</a>
                {/each}
                <RowTagAdder
                  scope="company"
                  entityId={company.id}
                  currentTags={tags}
                  suggestions={data.allTags}
                />
              </div>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <p class="text-[11px] text-[var(--color-subtle)]">
    Tip: <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">j/k</kbd> navigate ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">↵</kbd> open ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">*</kbd> favorite ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">#</kbd> archive
  </p>
</div>
