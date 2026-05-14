<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Search, Star, Archive, Tag, X, Plus, Loader2 } from 'lucide-svelte';
  import RowTagAdder from '$lib/components/RowTagAdder.svelte';
  import RowContactCell from '$lib/components/RowContactCell.svelte';
  import PriorityFlag from '$lib/components/PriorityFlag.svelte';
  import StatusCell from '$lib/components/StatusCell.svelte';
  import PriorityFilterChip from '$lib/components/PriorityFilterChip.svelte';
  import StatusFilterChip from '$lib/components/StatusFilterChip.svelte';
  import SortHeader from '$lib/components/SortHeader.svelte';
  import CompanyLogo from '$lib/components/CompanyLogo.svelte';
  import CompanyCell from '$lib/components/CompanyCell.svelte';
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
      const res = await fetch('/api/people', {
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

</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">People</h1>
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
          Add person
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
        <p class="text-sm text-[var(--color-muted)]">Paste a link in the topbar, or use <strong>Add person</strong> above to add someone.</p>
      {/if}
    </div>
  {:else}
    <!-- CSS grid rather than a real <table> so each cell can host a button/
         popover for inline editing without table-cell layout quirks. -->
    <div class="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]">
      <div
        class="hidden md:grid items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[var(--color-subtle)]"
        style="grid-template-columns: 24px minmax(0,1.5fr) minmax(0,1.1fr) minmax(0,0.9fr) 150px minmax(0,1fr);"
      >
        <span class="cap-label">·</span>
        <SortHeader label="Name" sortKey="name" current={data.sort} href={sortHref} direction="asc" />
        <SortHeader label="Company" sortKey="company" current={data.sort} href={sortHref} sortable={false} />
        <SortHeader label="Contact" sortKey="contact" current={data.sort} href={sortHref} sortable={false} />
        <SortHeader label="Activity" sortKey="lastInteraction" current={data.sort} href={sortHref} />
        <SortHeader label="Tags" sortKey="tags" current={data.sort} href={sortHref} sortable={false} />
      </div>

      <ul role="list">
        {#each rows as person, i (person.id)}
          {@const tags = data.itemTags[person.id] ?? []}
          {@const currentStatusId = optimisticStatus[person.id] !== undefined ? optimisticStatus[person.id] : person.statusId}
          {@const sel = i === selected}
          <li data-entity-row>
            <!-- Mobile card (< md) -->
            <div class="md:hidden group relative flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-3 transition-colors last:border-b-0 {sel ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-row-hover)]'} {person.isArchived ? 'opacity-60' : ''}">
              <PriorityFlag value={(person.priority as Priority) ?? null} onChange={(p) => setPriority(person.id, p)} />
              <a href={`/people/${person.id}`} class="flex min-w-0 flex-1 items-center gap-3">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-muted)]">
                  {#if person.avatarUrl}
                    <img src={person.avatarUrl} alt="" loading="lazy" class="h-full w-full object-cover" />
                  {:else}
                    {initials(person.name) || '·'}
                  {/if}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <span class="truncate text-sm font-medium text-[var(--color-text)]">{person.name}</span>
                    {#if person.isFavorite}
                      <Star size={11} strokeWidth={2} fill="currentColor" class="shrink-0 text-[var(--color-warning)]" />
                    {/if}
                  </span>
                  {#if person.companyName}
                    <span class="block truncate text-xs text-[var(--color-muted)]">{person.companyName}</span>
                  {:else if person.role}
                    <span class="block truncate text-xs text-[var(--color-muted)]">{person.role}</span>
                  {/if}
                </span>
              </a>
              <StatusCell value={currentStatusId} statuses={statuses} scope="person" onChange={(s) => setStatus(person.id, s)} onStatusesChange={(next) => (statuses = next)} />
            </div>
            <!-- Desktop row (>= md) -->
            <div
              class="group relative hidden md:grid items-center gap-3 border-b border-[var(--color-border)] px-3 transition-colors last:border-b-0 {sel ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-row-hover)]'} {person.isArchived ? 'opacity-60' : ''}"
              style="grid-template-columns: 24px minmax(0,1.5fr) minmax(0,1.1fr) minmax(0,0.9fr) 150px minmax(0,1fr); min-height: 56px; padding-top: 8px; padding-bottom: 8px;"
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
                  {#if person.role}
                    <span class="block truncate text-xs text-[var(--color-muted)]">{person.role}</span>
                  {/if}
                </span>
              </a>

              <div class="min-w-0">
                <CompanyCell
                  companyId={person.companyId ?? null}
                  companyName={person.companyName ?? null}
                  companyDomain={person.companyDomain ?? null}
                  companyLogoUrl={person.companyLogoUrl ?? null}
                  companyFaviconUrl={person.companyFaviconUrl ?? null}
                  onPick={(c) => patch(person.id, { companyId: c?.id ?? null })}
                />
              </div>

              <div class="min-w-0">
                <RowContactCell url={person.url} domain={person.domain} email={person.email} />
              </div>

              <div class="flex min-w-0 flex-col gap-0.5">
                <StatusCell
                  value={currentStatusId}
                  statuses={statuses}
                  scope="person"
                  onChange={(s) => setStatus(person.id, s)}
                  onStatusesChange={(next) => (statuses = next)}
                />
                {#if person.lastAt}
                  <span class="tabular pl-1 text-xs text-[var(--color-subtle)]">{formatLastSeen(person.lastAt)}</span>
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
                  scope="person"
                  entityId={person.id}
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
  {/if}

  <!-- Row actions reachable via the detail page; we keep the list dense and
       defer favorite/archive/delete to the keyboard (* / # / del prompt). -->
  <p class="hidden sm:block text-[11px] text-[var(--color-subtle)]">
    Tip: <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">j/k</kbd> navigate ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">↵</kbd> open ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">*</kbd> favorite ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">#</kbd> archive
  </p>
</div>
