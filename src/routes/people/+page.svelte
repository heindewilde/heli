<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Search, Star, Archive, Tag, X, Rows3, Rows4, Loader2 } from 'lucide-svelte';
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
  import { buildUrl as buildUrlBase } from '$lib/url';
  import { formatLastSeen } from '$lib/interactions';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let q = $state(data.q);
  let selected = $state(0);
  let rows = $derived(data.items);
  // Statuses are read from `data` directly; inline-create triggers an
  // invalidateAll so the next render reflects the new option.
  let statuses = $derived<StatusRow[]>(data.statuses);

  const DENSITY_KEY = 'gusto.people.density';
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
    return buildUrlBase('/people', page.url.searchParams, overrides);
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
    const res = await fetch(`/api/people/${id}`, {
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

  function initials(name: string): string {
    return name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  // Clicking the active sort key clears it (reverts to default).
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

  // Optimistic mirror of the status assignment so the cell reflects
  // immediately while the PATCH is in flight.
  let optimisticStatus = $state<Record<string, string | null>>({});
  async function setStatus(id: string, next: StatusRow | null) {
    optimisticStatus[id] = next?.id ?? null;
    try {
      await patch(id, { statusId: next?.id ?? null });
    } finally {
      delete optimisticStatus[id];
    }
  }
  async function setPriority(id: string, next: Priority) {
    await patch(id, { priority: next });
  }

  async function onCreated(_id: string) {
    await invalidateAll();
  }
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">People</h1>
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
      placeholder="Search people…"
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

  <InlineCreateRow placeholder="Add a person…" endpoint="/api/people" {onCreated} />

  {#if rows.length === 0}
    <div class="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
      {#if data.q}
        <p class="text-sm text-[var(--color-muted)]">No people match &ldquo;{data.q}&rdquo;.</p>
      {:else if data.tag}
        <p class="text-sm text-[var(--color-muted)]">No people tagged <strong>{data.tag.name}</strong> yet.</p>
        <a href="/people" class="mt-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm">Clear tag filter</a>
      {:else if data.favorite || data.archived || data.priorityFilter || data.statusFilter}
        <p class="text-sm text-[var(--color-muted)]">No people in this filter.</p>
      {:else}
        <p class="text-sm text-[var(--color-muted)]">Paste a link in the topbar, or type a name above to add someone.</p>
      {/if}
    </div>
  {:else}
    <!-- CSS grid rather than a real <table> so each cell can host a button/
         popover for inline editing without table-cell layout quirks. -->
    <div class="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]">
      <div
        class="grid items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-2 text-[var(--color-subtle)]"
        style="grid-template-columns: 28px minmax(0,1.6fr) minmax(0,1.2fr) 84px minmax(0,140px) minmax(0,1fr);"
      >
        <span class="cap-label">·</span>
        <SortHeader label="Name" sortKey="name" current={data.sort} href={sortHref} direction="asc" />
        <SortHeader label="Company" sortKey="company" current={data.sort} href={sortHref} sortable={false} />
        <SortHeader label="Last seen" sortKey="lastInteraction" current={data.sort} href={sortHref} align="right" />
        <SortHeader label="Status" sortKey="status" current={data.sort} href={sortHref} />
        <SortHeader label="Tags" sortKey="tags" current={data.sort} href={sortHref} sortable={false} />
      </div>

      <ul role="list">
        {#each rows as person, i (person.id)}
          {@const tags = data.itemTags[person.id] ?? []}
          {@const currentStatusId = optimisticStatus[person.id] !== undefined ? optimisticStatus[person.id] : person.statusId}
          {@const sel = i === selected}
          <li>
            <div
              data-entity-row
              class="group grid items-center gap-2 border-b border-[var(--color-border)] px-2 transition-colors last:border-b-0 hover:bg-[var(--color-surface-2)] {sel ? 'bg-[var(--color-highlight-bg)]' : ''} {person.isArchived ? 'opacity-60' : ''}"
              style="grid-template-columns: 28px minmax(0,1.6fr) minmax(0,1.2fr) 84px minmax(0,140px) minmax(0,1fr); {density === 'compact' ? 'min-height: 36px; padding-top: 2px; padding-bottom: 2px;' : 'min-height: 52px; padding-top: 6px; padding-bottom: 6px;'}"
            >
              <PriorityFlag
                value={(person.priority as Priority) ?? null}
                onChange={(p) => setPriority(person.id, p)}
              />

              <a href={`/people/${person.id}`} class="flex min-w-0 items-center gap-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-muted)]">
                  {#if person.avatarUrl}
                    <img src={person.avatarUrl} alt="" loading="lazy" class="h-full w-full object-cover" />
                  {:else}
                    {initials(person.name) || '·'}
                  {/if}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-[var(--color-text)]">{person.name}</span>
                    {#if person.source === 'parsing'}
                      <Loader2 size={11} strokeWidth={2} class="animate-spin text-[var(--color-subtle)]" />
                    {/if}
                    {#if person.isFavorite}
                      <Star size={11} strokeWidth={2} fill="currentColor" class="text-[var(--color-warning)]" />
                    {/if}
                  </span>
                  {#if density === 'comfortable' && (person.role || person.email)}
                    <span class="block truncate text-xs text-[var(--color-muted)]">
                      {person.role || person.email}
                    </span>
                  {/if}
                </span>
              </a>

              <div class="min-w-0">
                {#if person.companyId && person.companyName}
                  <a
                    href={`/companies/${person.companyId}`}
                    class="inline-flex max-w-full items-center gap-1.5 truncate text-sm text-[var(--color-text)] hover:underline"
                  >
                    {#if person.companyLogoUrl || person.companyFaviconUrl}
                      <img
                        src={person.companyLogoUrl ?? person.companyFaviconUrl ?? ''}
                        alt=""
                        loading="lazy"
                        class="h-4 w-4 shrink-0 rounded-[3px] object-cover"
                      />
                    {:else}
                      <span class="h-4 w-4 shrink-0 rounded-[3px] border border-[var(--color-border)] bg-[var(--color-surface-2)]"></span>
                    {/if}
                    <span class="truncate">{person.companyName}</span>
                  </a>
                {:else}
                  <span class="text-xs text-[var(--color-subtle)]">—</span>
                {/if}
              </div>

              <div class="tabular text-right text-xs text-[var(--color-muted)]">
                {formatLastSeen(person.lastAt)}
              </div>

              <div class="min-w-0">
                <StatusCell
                  value={currentStatusId}
                  statuses={statuses}
                  scope="person"
                  onChange={(s) => setStatus(person.id, s)}
                  onStatusesChange={(next) => (statuses = next)}
                />
              </div>

              <div class="flex min-w-0 flex-wrap items-center gap-1">
                {#each tags as t (t.id)}
                  <a
                    href={buildUrl({ tag: t.slug })}
                    class="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                  >{t.name}</a>
                {/each}
                <RowTagAdder
                  scope="person"
                  entityId={person.id}
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

  <!-- Row actions reachable via the detail page; we keep the list dense and
       defer favorite/archive/delete to the keyboard (* / # / del prompt). -->
  <p class="text-[11px] text-[var(--color-subtle)]">
    Tip: <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">j/k</kbd> navigate ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">↵</kbd> open ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">*</kbd> favorite ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">#</kbd> archive
  </p>
</div>
