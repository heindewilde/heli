<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Search, Star, Archive, Tag, X, Plus, Loader2, Building2 } from 'lucide-svelte';
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
  import { registerCommands } from '$lib/commands/registry.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { buildUrl as buildUrlBase } from '$lib/url';
  import { formatLastSeen } from '$lib/interactions';
  import { createListCache } from '$lib/client/listCache.svelte';
  import { onIntersect } from '$lib/actions';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';

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

  // The grid template for this table, defined once. The header row and the data
  // rows must agree exactly; they were previously two identical literals kept
  // in sync by hand, which is a misalignment waiting to happen.
  const GRID = 'grid-template-columns: 24px minmax(0,2fr) minmax(0,1.3fr) 160px minmax(0,1.2fr);';
  const ROW_GRID = `${GRID} min-height: 56px; padding-top: 8px; padding-bottom: 8px;`;

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
      // The POST already returned the finished row in list shape, so insert it
      // rather than calling invalidateAll(). That reload was a whole extra SSR
      // render — eight more database round trips — to display something we
      // are holding.
      const created = (await res.json()) as { id: string; row: Row | null };
      addName = '';
      showAdd = false;
      if (created.row) cache.insert(created.row, 'start');
      else await invalidateAll();
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

  // Registered as commands rather than a second `bindKeys` listener, so there
  // is one dispatcher in the app and the shortcut sheet stays truthful. The
  // `when` guard is what keeps them off other pages.
  onMount(() => {
    const hasRows = () => rows.length > 0;
    const current = () => rows[selected];
    return registerCommands([
      {
        id: 'list:next',
        title: 'Next row',
        section: 'This page',
        shortcut: 'j',
        hidden: true,
        when: hasRows,
        run: () => {
          selected = Math.min(rows.length - 1, selected + 1);
          scrollSelectedIntoView();
        }
      },
      {
        id: 'list:next-arrow',
        title: 'Next row',
        section: 'This page',
        shortcut: 'ArrowDown',
        hidden: true,
        when: hasRows,
        run: () => {
          selected = Math.min(rows.length - 1, selected + 1);
          scrollSelectedIntoView();
        }
      },
      {
        id: 'list:prev',
        title: 'Previous row',
        section: 'This page',
        shortcut: 'k',
        hidden: true,
        when: hasRows,
        run: () => {
          selected = Math.max(0, selected - 1);
          scrollSelectedIntoView();
        }
      },
      {
        id: 'list:prev-arrow',
        title: 'Previous row',
        section: 'This page',
        shortcut: 'ArrowUp',
        hidden: true,
        when: hasRows,
        run: () => {
          selected = Math.max(0, selected - 1);
          scrollSelectedIntoView();
        }
      },
      {
        id: 'list:open',
        title: 'Open the selected row',
        section: 'This page',
        shortcut: 'Enter',
        when: hasRows,
        run: () => {
          const r = current();
          if (r) goto(`/companies/${r.id}`);
        }
      },
      {
        id: 'list:open-e',
        title: 'Open the selected row',
        section: 'This page',
        shortcut: 'e',
        hidden: true,
        when: hasRows,
        run: () => {
          const r = current();
          if (r) goto(`/companies/${r.id}`);
        }
      },
      {
        id: 'list:favorite',
        title: 'Toggle favourite',
        section: 'This page',
        shortcut: '*',
        when: hasRows,
        run: () => {
          const r = current();
          if (r) patch(r.id, { isFavorite: !r.isFavorite });
        }
      },
      {
        id: 'list:archive',
        title: 'Toggle archived',
        section: 'This page',
        shortcut: '#',
        when: hasRows,
        run: () => {
          const r = current();
          if (r) patch(r.id, { isArchived: !r.isArchived });
        }
      },
      {
        id: 'list:new',
        title: 'New company',
        section: 'Create',
        when: () => true,
        run: openAdd
      }
    ]);
  });

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

<svelte:head>
  <title>Companies — {APP_NAME}</title>
</svelte:head>

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
      <span class="text-[var(--color-subtle)]">—</span>
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
    <!-- Copy branches by cause as before; EmptyState supplies the form. -->
    {#if data.q}
      <EmptyState icon={Search} title="No matches" description={`Nothing here matches “${data.q}”.`}>
        {#snippet actions()}
          <Button variant="secondary" onclick={() => { q = ''; navTo({ q: null }); }}>Clear search</Button>
        {/snippet}
      </EmptyState>
    {:else if data.tag}
      <EmptyState icon={Tag} title="Nothing tagged yet" description={`No companies are tagged ${data.tag.name}.`}>
        {#snippet actions()}
          <Button href="/companies" variant="secondary">Clear tag filter</Button>
        {/snippet}
      </EmptyState>
    {:else if data.favorite || data.archived || data.priorityFilter || data.statusFilter}
      <EmptyState icon={Building2} title="Nothing in this filter" description="Try widening it, or clear the filters to see everything.">
        {#snippet actions()}
          <Button href="/companies" variant="secondary">Clear filters</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <EmptyState
        icon={Building2}
        title="No companies yet"
        description="Paste a company's URL in the sidebar and Heli will pull in its logo, industry and description."
      >
        {#snippet actions()}
          <Button variant="primary" size="md" onclick={openAdd}>Add company</Button>
        {/snippet}
      </EmptyState>
    {/if}
  {:else}
    <div class="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]">
      <div
        class="hidden md:grid items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[var(--color-subtle)]"
        style={GRID}
      >
        <span aria-hidden="false"><span class="sr-only">Priority</span></span>
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
            <!-- `tap` rather than the body-wide `hover`: hover never fires on
                 touch, so the mobile layout would otherwise get no preload at
                 all. `tap` starts the load on touchstart, ~80ms before the
                 click lands. -->
            <div data-sveltekit-preload-data="tap" class="md:hidden group relative flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-3 transition-colors last:border-b-0 {sel ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-row-hover)]'} {company.isArchived ? 'opacity-60' : ''}">
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
              style={ROW_GRID}
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
      <div use:onIntersect={loadMore} class="flex justify-center">
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
