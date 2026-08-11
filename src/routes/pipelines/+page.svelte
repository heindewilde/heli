<script lang="ts">
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { Funnel } from 'lucide-svelte';
  import { APP_NAME } from '$lib/branding';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Search, Plus, ArrowDownUp } from 'lucide-svelte';
  import PipelineRow from '$lib/components/PipelineRow.svelte';
  import { registerCommands } from '$lib/commands/registry.svelte';
  import { toast } from '$lib/toasts.svelte';

  let { data } = $props();
  // Deleting a pipeline is admin-only server-side; don't offer it to members.
  const canManage = $derived(data.user?.role === 'owner' || data.user?.role === 'admin');

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
    return s ? `/pipelines?${s}` : '/pipelines';
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      goto(buildUrl({ q: q.trim() || null }), { replaceState: true, keepFocus: true, noScroll: true });
    }, 200);
  }

  async function archive(id: string, name: string, isArchived: number) {
    const res = await fetch(`/api/pipelines/${id}`, {
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
    if (!confirm(`Delete pipeline "${name}"? Items and stage history will be removed; the people and companies are not affected.`)) return;
    const res = await fetch(`/api/pipelines/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.danger('Delete failed');
      return;
    }
    toast.success(`Deleted ${name}`);
    await invalidateAll();
  }

  onMount(() => {
    const hasRows = () => rows.length > 0;
    const open = () => {
      const r = rows[selected];
      if (r) goto(`/pipelines/${r.id}`);
    };
    const move = (delta: number) => () => {
      selected = Math.min(rows.length - 1, Math.max(0, selected + delta));
      scrollSelectedIntoView();
    };
    return registerCommands([
      { id: 'list:next', title: 'Next row', section: 'This page', shortcut: 'j', hidden: true, when: hasRows, run: move(1) },
      { id: 'list:next-arrow', title: 'Next row', section: 'This page', shortcut: 'ArrowDown', hidden: true, when: hasRows, run: move(1) },
      { id: 'list:prev', title: 'Previous row', section: 'This page', shortcut: 'k', hidden: true, when: hasRows, run: move(-1) },
      { id: 'list:prev-arrow', title: 'Previous row', section: 'This page', shortcut: 'ArrowUp', hidden: true, when: hasRows, run: move(-1) },
      { id: 'list:open', title: 'Open the selected row', section: 'This page', shortcut: 'Enter', when: hasRows, run: open },
      { id: 'list:open-e', title: 'Open the selected row', section: 'This page', shortcut: 'e', hidden: true, when: hasRows, run: open },
      { id: 'list:archive', title: 'Toggle archived', section: 'This page', shortcut: '#', when: hasRows, run: () => {
          const r = rows[selected];
          if (r) archive(r.id, r.name, r.isArchived);
        } }
    ]);
  });

  function scrollSelectedIntoView() {
    setTimeout(() => {
      const el = document.querySelectorAll('[data-pipeline-row]')[selected] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  const ARCHIVED_FILTERS = [
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
    { value: 'all', label: 'All' }
  ] as const;
</script>

<svelte:head>
  <title>Pipelines — {APP_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">Pipelines</h1>
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
          class="bg-transparent py-1.5 pl-1 pr-1 text-sm outline-none"
        >
          <option value="updated">Recently updated</option>
          <option value="recent">Recently added</option>
          <option value="name">Name</option>
        </select>
      </label>
      <a
        href="/pipelines/new"
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)]"
      >
        <Plus size={14} strokeWidth={2} />
        New pipeline
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
      placeholder="Search pipelines…"
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
    <!-- Copy still branches by cause; EmptyState supplies the form. -->
    {#if data.q}
      <EmptyState icon={Search} title="No matches" description={`Nothing here matches “${data.q}”.`}>
        {#snippet actions()}<Button href="/pipelines" variant="secondary">Clear search</Button>{/snippet}
      </EmptyState>
    {:else if data.archived !== 'active'}
      <EmptyState icon={Funnel} title="Nothing here" description={`No ${data.archived} pipelines.`}>
        {#snippet actions()}<Button href="/pipelines" variant="secondary">Show active</Button>{/snippet}
      </EmptyState>
    {:else}
      <EmptyState icon={Funnel} title="No pipelines yet" description={"Track sales deals, a hiring funnel or partnership outreach with stages you define."}>
        {#snippet actions()}<Button href="/pipelines/new" variant="primary" size="md">New pipeline</Button>{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <ul class="flex flex-col gap-1">
      {#each rows as p, i (p.id)}
        <li>
          <PipelineRow
            href={`/pipelines/${p.id}`}
            name={p.name}
            description={p.description}
            isArchived={!!p.isArchived}
            openCount={p.openCount}
            wonCount={p.wonCount}
            lostCount={p.lostCount}
            stageCount={p.stageCount}
            selected={i === selected}
            onArchive={() => archive(p.id, p.name, p.isArchived)}
            onDelete={canManage ? () => del(p.id, p.name) : undefined}
          />
        </li>
      {/each}
    </ul>
  {/if}
</div>
