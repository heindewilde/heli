<script lang="ts">
  import { APP_NAME } from '$lib/branding';
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
  import { registerCommands } from '$lib/commands/registry.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { buildUrl as buildUrlBase } from '$lib/url';
  import { formatLastSeen } from '$lib/interactions';
  import { createListCache } from '$lib/client/listCache.svelte';
  import { createSelection } from '$lib/client/selection.svelte';
  import ActionBar from '$lib/ui/ActionBar.svelte';
  import { layerDepth } from '$lib/ui/layerStack';
  import Checkbox from '$lib/ui/Checkbox.svelte';
  import BulkActions from '$lib/components/BulkActions.svelte';
  import UrlImportDialog from '$lib/components/UrlImportDialog.svelte';
  import { ClipboardPaste } from 'lucide-svelte';
  import ExportButton from '$lib/components/ExportButton.svelte';
  import AddRecordButton from '$lib/components/AddRecordButton.svelte';
  import { pollWhile } from '$lib/polling';
  import { onIntersect } from '$lib/actions';
  import Avatar from '$lib/ui/Avatar.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { Users } from 'lucide-svelte';

  let { data } = $props();

  type Row = (typeof data.items)[number];

  // svelte-ignore state_referenced_locally
  let q = $state(data.q);
  let selected = $state(0);
  // Local reactive cache holding the row list. Mutations apply here
  // synchronously (optimistic), then PATCH; rollback on error.
  // svelte-ignore state_referenced_locally
  const cache = createListCache<Row>(data.items);
  // Re-hydrate from SSR whenever the server load returns a fresh items array
  // (filter change, sort change, after invalidateAll). When this happens we
  // also reset the load-more cursor to whatever the new server view exposes.
  const selection = createSelection();
  $effect(() => {
    cache.hydrate(data.items);
    nextCursor = data.nextCursor;
    // Prune rather than clear. An action that ends in `invalidateAll()` brings
    // the same rows back, and dropping the ticks every time you tagged
    // something would make a second action impossible. A filter change removes
    // most ids, so the selection shrinks on its own.
    selection.prune(data.items.map((r) => r.id));
  });
  const rows = $derived(cache.items);
  const rowIds = $derived(rows.map((r) => r.id));
  const allTicked = $derived(rows.length > 0 && rows.every((r) => selection.has(r.id)));
  const someTicked = $derived(selection.size > 0);

  /**
   * A bulk import leaves its rows on `source = 'parsing'` while the enrichment
   * queue drains. The spinner already renders per row; this is what makes it
   * eventually stop. Bounded at 30s by `pollWhile` — a full SSR reload every
   * 1.5s is not something to run for the length of a 500-row drain.
   */
  $effect(() => {
    if (!rows.some((r) => r.source === 'parsing')) return;
    return pollWhile(() => cache.items.some((r) => r.source === 'parsing'), invalidateAll);
  });

  // svelte-ignore state_referenced_locally
  let nextCursor = $state<string | null>(data.nextCursor);
  let loadingMore = $state(false);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    loadingMore = true;
    try {
      const res = await fetch(`/api/people/list?cursor=${encodeURIComponent(nextCursor)}`);
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
  // Statuses are read from `data` directly; inline-create triggers an
  // invalidateAll so the next render reflects the new option.
  let statuses = $derived<StatusRow[]>(data.statuses);

  // The grid template for this table, defined once. The header row and the data
  // rows must agree exactly; they were previously two identical literals kept
  // in sync by hand, which is a misalignment waiting to happen.
  //
  // Column 1 is the selection checkbox and the priority flag moved to the far
  // right — both are 24px, so the table's proportions are unchanged.
  const GRID = 'grid-template-columns: 24px minmax(0,1.5fr) minmax(0,1.1fr) minmax(0,0.9fr) 150px minmax(0,1fr) 24px;';
  const ROW_GRID = `${GRID} min-height: 56px; padding-top: 8px; padding-bottom: 8px;`;

  let showImport = $state(false);
  let showAdd = $state(false);
  let addBusy = $state(false);

  /**
   * Opens the Add popover. Called from the trigger, from the empty state's call
   * to action, and from the `n p` keyboard command — three entry points to
   * one popover instance, which is why `showAdd` lives here and is bound in.
   */
  function openAdd() {
    showAdd = true;
  }

  /** Returns whether the record was created, so the field knows to reset. */
  async function submitAdd(name: string): Promise<boolean> {
    if (addBusy) return false;
    addBusy = true;
    try {
      const res = await fetch('/api/people', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        toast.danger('Could not create');
        return false;
      }
      // The POST already returned the finished row in list shape, so insert it
      // rather than calling invalidateAll(). That reload was a whole extra SSR
      // render — eight more database round trips — to display something we
      // are holding.
      const created = (await res.json()) as { id: string; row: Row | null };
      if (created.row) cache.insert(created.row, 'start');
      else await invalidateAll();
      return true;
    } catch {
      toast.danger('Could not create');
      return false;
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

  /**
   * The download URL, and the same query pointed at the count endpoint.
   *
   * Every active filter is already in `page.url.searchParams`, and the endpoint
   * parses them with the same module the loader does, so the file and the list
   * cannot disagree. The link inside the Export panel needs
   * `data-sveltekit-reload`: `/api/export` has no `+page`, so without it the
   * client router turns the click into a thrown "Not found" and no download —
   * in the built app only, which is how the Settings links stayed broken.
   */
  const exportHref = $derived(buildUrlBase('/api/export', page.url.searchParams, {
      kind: 'people',
      // Always explicit: a bare /api/export means the whole library, so the
      // page has to say which half of that it wants.
      archived: data.archived ? '1' : '0'
    }));
  const exportCountHref = $derived(
    buildUrlBase('/api/export/count', page.url.searchParams, {
      kind: 'people',
      archived: data.archived ? '1' : '0'
    })
  );

  /**
   * What the Export panel says it is about to hand over. The trigger is just
   * "Export"; naming the scope is the panel's job, because a count plus the
   * filters that produced it is a preview and an adjective is not.
   */
  const exportDetail = $derived.by(() => {
    const out: string[] = [];
    if (data.q) out.push(`Matching “${data.q}”`);
    if (data.tag) out.push(`Tagged “${data.tag.name}”`);
    if (data.favorite) out.push('Favourites only');
    if (data.priorityFilter?.length)
      out.push(`Priority: ${data.priorityFilter.map((p) => p ?? 'none').join(', ')}`);
    if (data.statusFilter?.length) out.push(`Status: ${data.statusFilter.length} selected`);
    out.push(data.archived ? 'Archived included' : 'Archived excluded');
    return out;
  });

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
      const res = await fetch(`/api/people/${id}`, {
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

  /**
   * One request per bulk action, against `/api/people/bulk`.
   *
   * What happens afterwards differs by action, and the difference is whether
   * the list cache owns what changed:
   *  - priority and status are row columns, so they patch optimistically;
   *  - tags are not — `data.itemTags`, `data.allTags` and the tag counts all
   *    come off the server load, which is the same trade `RowTagAdder` makes;
   *  - a collection change shows nothing on this page at all;
   *  - a delete has to reload because `data.total` is not cache-owned either.
   */
  let bulkBusy = $state(false);

  async function bulk(
    action: Record<string, unknown>,
    onOk: (count: number) => void | Promise<void>,
    rollback?: () => void
  ) {
    if (bulkBusy || selection.size === 0) return;
    bulkBusy = true;
    try {
      const res = await fetch('/api/people/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: selection.ids, action })
      });
      if (!res.ok) {
        rollback?.();
        toast.danger(res.status === 403 ? 'You do not have permission' : 'Bulk action failed');
        return;
      }
      const { count } = (await res.json()) as { count: number };
      await onOk(count);
    } catch {
      rollback?.();
      toast.danger('Bulk action failed');
    } finally {
      bulkBusy = false;
    }
  }

  const plural = (n: number) => (n === 1 ? 'person' : 'people');

  function bulkPriority(next: Priority) {
    const rollback = cache.patchMany(selection.ids, { priority: next } as Partial<Row>);
    bulk(
      { kind: 'patch', fields: { priority: next } },
      (n) => {
        toast.success(`Updated ${n} ${plural(n)}`);
      },
      rollback
    );
  }

  function bulkStatus(next: string | null) {
    const rollback = cache.patchMany(selection.ids, { statusId: next } as Partial<Row>);
    bulk(
      { kind: 'patch', fields: { statusId: next } },
      (n) => {
        toast.success(`Updated ${n} ${plural(n)}`);
      },
      rollback
    );
  }

  function bulkTag(op: 'add' | 'remove', tag: { name?: string; tagId?: string }) {
    bulk({ kind: 'tag', op, ...tag }, async (n) => {
      toast.success(op === 'add' ? `Tagged ${n} ${plural(n)}` : `Untagged ${n} ${plural(n)}`);
      await invalidateAll();
    });
  }

  function bulkCollection(collectionId: string) {
    bulk({ kind: 'collection', op: 'add', collectionId }, (n) => {
      toast.success(`Added ${n} ${plural(n)} to the collection`);
    });
  }

  function bulkDelete() {
    const ids = [...selection.ids];
    const rollback = cache.removeMany(ids);
    bulk(
      { kind: 'delete' },
      async (n) => {
        selection.clear();
        toast.success(`Deleted ${n} ${plural(n)}`);
        // The total pill is not cache-owned.
        await invalidateAll();
      },
      rollback
    );
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
          if (r) goto(`/people/${r.id}`);
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
          if (r) goto(`/people/${r.id}`);
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
        id: 'list:select-toggle',
        title: 'Select this row',
        section: 'This page',
        shortcut: 'x',
        when: hasRows,
        run: () => {
          const r = current();
          if (!r) return;
          selection.toggle(r.id);
          selected = Math.min(rows.length - 1, selected + 1);
          scrollSelectedIntoView();
        }
      },
      {
        id: 'list:clear-selection',
        title: 'Clear the selection',
        section: 'This page',
        shortcut: 'Escape',
        hidden: true,
        // Stand down while any overlay is open. `layerStack` owns Escape for
        // those, and this dispatcher is a separate window listener that would
        // otherwise fire too — closing the tag popover *and* throwing away the
        // selection it was about to act on.
        when: () => selection.size > 0 && layerDepth() === 0,
        run: () => selection.clear()
      },
      {
        id: 'list:new',
        title: 'New person',
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

  async function setStatus(id: string, next: StatusRow | null) {
    await patch(id, { statusId: next?.id ?? null });
  }
  async function setPriority(id: string, next: Priority) {
    await patch(id, { priority: next });
  }

</script>

<svelte:head>
  <title>People — {APP_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">People</h1>
    <span class="tabular rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
      {data.total}
    </span>
    <div class="ml-auto flex items-center gap-2.5">
      <ExportButton
        href={exportHref}
        countHref={exportCountHref}
        detail={exportDetail}
        noun={['person', 'people']}
        size="sm"
      />
      <button
        type="button"
        onclick={() => (showImport = true)}
        title="Paste a list of links"
        class="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
      >
        <ClipboardPaste size={13} strokeWidth={2} />
        Import
      </button>
      <AddRecordButton bind:open={showAdd} noun="person" busy={addBusy} onsubmit={submitAdd} />
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
      <span aria-hidden="true" class="mx-1 h-4 w-px shrink-0 self-center bg-[var(--color-border)]"></span>
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
    <!--
      The copy already branched by cause, which is more care than most empty
      states get; what it lacked was form — one muted sentence in a dashed box.
      EmptyState supplies the icon, headline and action slot. The branching
      stays here, where it belongs.
    -->
    {#if data.q}
      <EmptyState icon={Search} title="No matches" description={`Nothing here matches “${data.q}”.`}>
        {#snippet actions()}
          <Button variant="secondary" onclick={() => { q = ''; navTo({ q: null }); }}>Clear search</Button>
        {/snippet}
      </EmptyState>
    {:else if data.tag}
      <EmptyState icon={Tag} title="Nothing tagged yet" description={`No one is tagged ${data.tag.name}.`}>
        {#snippet actions()}
          <Button href="/people" variant="secondary">Clear tag filter</Button>
        {/snippet}
      </EmptyState>
    {:else if data.favorite || data.archived || data.priorityFilter || data.statusFilter}
      <EmptyState icon={Users} title="Nothing in this filter" description="Try widening it, or clear the filters to see everyone.">
        {#snippet actions()}
          <Button href="/people" variant="secondary">Clear filters</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <EmptyState
        icon={Users}
        title="No people yet"
        description="Paste a link to anyone's profile in the sidebar and Heli will fill in the rest — or add someone by hand."
      >
        {#snippet actions()}
          <Button variant="primary" size="md" onclick={openAdd}>Add person</Button>
        {/snippet}
      </EmptyState>
    {/if}
  {:else}
    <!-- CSS grid rather than a real <table> so each cell can host a button/
         popover for inline editing without table-cell layout quirks. -->
    <div class="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]">
      <div
        class="group/head hidden md:grid items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[var(--color-subtle)]"
        style={GRID}
      >
        <!-- Revealed on hover like the row checkboxes, so an untouched table
             carries no column of empty boxes. Stays visible while a selection
             exists, because that is when you need to see what it reports. -->
        <span
          class={someTicked
            ? ''
            : 'opacity-0 transition-opacity focus-within:opacity-100 group-hover/head:opacity-100'}
        >
          <Checkbox
            checked={allTicked}
            indeterminate={someTicked && !allTicked}
            aria-label={allTicked ? 'Deselect all loaded rows' : 'Select all loaded rows'}
            onclick={() => selection.toggleAll(rowIds)}
          />
        </span>
        <SortHeader label="Name" sortKey="name" current={data.sort} href={sortHref} direction="asc" />
        <SortHeader label="Company" sortKey="company" current={data.sort} href={sortHref} sortable={false} />
        <SortHeader label="Contact" sortKey="contact" current={data.sort} href={sortHref} sortable={false} />
        <SortHeader label="Activity" sortKey="lastInteraction" current={data.sort} href={sortHref} />
        <SortHeader label="Tags" sortKey="tags" current={data.sort} href={sortHref} sortable={false} />
        <span><span class="sr-only">Priority</span></span>
      </div>

      <!--
        One definition for both layouts. Hidden until the row is hovered or a
        selection exists — a permanent column of empty boxes is noise on a dense
        list, which is why `PriorityFlag` hides too. `opacity-0` rather than
        `hidden` keeps it hit-testable and focusable.
      -->
      {#snippet rowCheckbox(id: string)}
        <span
          class={someTicked || selection.has(id)
            ? ''
            : 'opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100'}
        >
          <Checkbox
            checked={selection.has(id)}
            aria-label="Select row"
            onclick={(e) => {
              // No `preventDefault`. Cancelling a checkbox click makes the
              // browser run its *canceled activation steps*, which restore
              // `input.checked` to its old value — and it does that after every
              // handler has run, so it lands on top of the update Svelte just
              // made. The row stayed visually unticked while the count said
              // otherwise. `settings/import` had the right shape all along:
              // pass `checked`, listen, never cancel.
              //
              // The click fires before the DOM value flips back or forward, so
              // reading `shiftKey` here is safe. Space fires a click with
              // `shiftKey` false, so the keyboard toggles and cannot
              // range-select — `x` is the keyboard way.
              if ((e as MouseEvent).shiftKey) selection.rangeTo(id, rowIds);
              else selection.toggle(id);
            }}
          />
        </span>
      {/snippet}

      <ul role="list">
        {#each rows as person, i (person.id)}
          {@const tags = data.itemTags[person.id] ?? []}
{@const sel = i === selected}
          <li data-entity-row>
            <!-- Mobile card (< md) -->
            <!-- `tap` rather than the body-wide `hover`: hover never fires on
                 touch, so the mobile layout would otherwise get no preload at
                 all. `tap` starts the load on touchstart, ~80ms before the
                 click lands. -->
            <div data-sveltekit-preload-data="tap" class="md:hidden group relative flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-3 transition-colors last:border-b-0 {sel ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-row-hover)]'} {person.isArchived ? 'opacity-60' : ''}">
              {@render rowCheckbox(person.id)}
              <a href={`/people/${person.id}`} class="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={person.name} src={person.avatarUrl} size="md" />
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
              <StatusCell value={person.statusId} statuses={statuses} scope="person" onChange={(s) => setStatus(person.id, s)} onStatusesChange={(next) => (statuses = next)} />
              <PriorityFlag value={(person.priority as Priority) ?? null} onChange={(p) => setPriority(person.id, p)} />
            </div>
            <!-- Desktop row (>= md) -->
            <div
              class="group relative hidden md:grid items-center gap-3 border-b border-[var(--color-border)] px-3 transition-colors last:border-b-0 {sel ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-row-hover)]'} {person.isArchived ? 'opacity-60' : ''}"
              style={ROW_GRID}
            >
              {@render rowCheckbox(person.id)}

              <a href={`/people/${person.id}`} class="flex min-w-0 items-center gap-3">
                <Avatar name={person.name} src={person.avatarUrl} size="md" />
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
                  onPick={(c) =>
                    patch(
                      person.id,
                      { companyId: c?.id ?? null },
                      {
                        companyId: c?.id ?? null,
                        companyName: c?.name ?? null,
                        companyDomain: c?.domain ?? null,
                        companyLogoUrl: c?.logoUrl ?? null,
                        companyFaviconUrl: c?.faviconUrl ?? null
                      } as Partial<Row>
                    )}
                />
              </div>

              <div class="min-w-0">
                <RowContactCell url={person.url} domain={person.domain} email={person.email} />
              </div>

              <div class="flex min-w-0 flex-col gap-0.5">
                <StatusCell
                  value={person.statusId}
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

              <PriorityFlag
                value={(person.priority as Priority) ?? null}
                onChange={(p) => setPriority(person.id, p)}
              />
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

  <!-- Row actions reachable via the detail page; we keep the list dense and
       defer favorite/archive/delete to the keyboard (* / # / del prompt). -->
  <p class="hidden sm:block text-[11px] text-[var(--color-subtle)]">
    Tip: <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">j/k</kbd> navigate ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">↵</kbd> open ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">x</kbd> select ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">*</kbd> favorite ·
    <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1">#</kbd> archive
  </p>
</div>

<UrlImportDialog open={showImport} from="people" onclose={() => (showImport = false)} />

<ActionBar count={selection.size} noun="person" plural="people" onclear={() => selection.clear()}>
  <BulkActions
    scope="person"
    ids={selection.ids}
    {statuses}
    tags={data.allTags}
    onPriority={bulkPriority}
    onStatus={bulkStatus}
    onTag={bulkTag}
    onCollection={bulkCollection}
    onDelete={bulkDelete}
  />
</ActionBar>
