<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Search, Plus, ArrowDownUp } from 'lucide-svelte';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import { registerCommands } from '$lib/commands/registry.svelte';
  import type { ProjectStatus } from '$lib/server/schema';

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
    return s ? `/projects?${s}` : '/projects';
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      goto(buildUrl({ q: q.trim() || null }), { replaceState: true, keepFocus: true, noScroll: true });
    }, 200);
  }

  onMount(() => {
    const hasRows = () => rows.length > 0;
    const open = () => {
      const r = rows[selected];
      if (r) goto(`/projects/${r.id}`);
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
      { id: 'list:open-e', title: 'Open the selected row', section: 'This page', shortcut: 'e', hidden: true, when: hasRows, run: open }
    ]);
  });

  function scrollSelectedIntoView() {
    setTimeout(() => {
      const el = document.querySelectorAll('[data-project-row]')[selected] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  const STATUS_FILTERS: { value: ProjectStatus | 'all'; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'completed', label: 'Completed' },
    { value: 'archived', label: 'Archived' },
    { value: 'all', label: 'All' }
  ];
</script>

<svelte:head>
  <title>Projects — {APP_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">Projects</h1>
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
          disabled={!!data.q}
          class="bg-transparent py-1.5 pl-1 pr-1 text-sm outline-none disabled:opacity-60"
          title={data.q ? 'Sort is fixed to relevance while searching' : 'Sort by'}
        >
          <option value="updated">Recently updated</option>
          <option value="recent">Recently added</option>
          <option value="endDate">End date</option>
          <option value="name">Name</option>
          <option value="lastInteraction">Last interaction</option>
        </select>
      </label>
      <a
        href="/projects/new"
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)]"
      >
        <Plus size={14} strokeWidth={2} />
        New project
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
      placeholder="Search projects…"
      class="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm"
    />
  </div>

  <div class="flex flex-wrap items-center gap-2 text-xs">
    {#each STATUS_FILTERS as f (f.value)}
      <a
        href={buildUrl({ status: f.value === 'active' ? null : f.value })}
        class="rounded-full border px-2.5 py-1 {data.status === f.value
          ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
          : 'border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface)]'}"
      >{f.label}</a>
    {/each}
  </div>

  {#if rows.length === 0}
    <div class="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
      {#if data.q}
        <p class="text-sm text-[var(--color-muted)]">No projects match &ldquo;{data.q}&rdquo;.</p>
      {:else if data.status !== 'active'}
        <p class="text-sm text-[var(--color-muted)]">No {data.status} projects.</p>
      {:else}
        <p class="text-sm text-[var(--color-muted)]">No projects yet — track a fundraise, a launch, or a consulting engagement.</p>
        <a
          href="/projects/new"
          class="mt-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)]"
        ><Plus size={14} strokeWidth={2} /> New project</a>
      {/if}
    </div>
  {:else}
    <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {#each rows as p, i (p.id)}
        {@const projectCompanies = data.itemCompanies[p.id] ?? []}
        <li>
          <ProjectCard
            href={`/projects/${p.id}`}
            name={p.name}
            description={p.description}
            status={p.status}
            startDate={p.startDate}
            endDate={p.endDate}
            memberCount={p.memberCount}
            companies={projectCompanies}
            icon={p.icon}
            selected={i === selected}
          />
        </li>
      {/each}
    </ul>
  {/if}
</div>
