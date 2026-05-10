<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Search, Plus, Tag, X, ArrowDownUp } from 'lucide-svelte';
  import ProjectRow from '$lib/components/ProjectRow.svelte';
  import RowTagAdder from '$lib/components/RowTagAdder.svelte';
  import { bindKeys } from '$lib/keyboard.svelte';
  import { toast } from '$lib/toasts.svelte';
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

  async function del(id: string, name: string) {
    if (!confirm(`Delete project "${name}"? Member links and interactions stay; only the project itself goes away.`)) return;
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
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
        if (r) goto(`/projects/${r.id}`);
        return true;
      }
    })
  );

  function scrollSelectedIntoView() {
    setTimeout(() => {
      const el = document.querySelectorAll('[data-project-row]')[selected] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  const STATUS_FILTERS: { value: ProjectStatus | 'all'; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'paused', label: 'Paused' },
    { value: 'archived', label: 'Archived' },
    { value: 'all', label: 'All' }
  ];
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">Projects</h1>
    <span class="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
      {data.total}
    </span>
    <div class="ml-auto flex items-center gap-2">
      <label class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-2 pr-1 text-xs text-[var(--color-muted)]">
        <ArrowDownUp size={12} strokeWidth={2} class="text-[var(--color-subtle)]" />
        <span class="sr-only">Sort by</span>
        <select
          value={data.sort}
          onchange={(e) => goto(buildUrl({ sort: (e.currentTarget as HTMLSelectElement).value }), { replaceState: true, keepFocus: true, noScroll: true })}
          disabled={!!data.q}
          class="bg-transparent py-1 pl-1 pr-1 text-xs outline-none disabled:opacity-60"
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
    {#if data.tag}
      <span class="text-[var(--color-subtle)]">·</span>
      <a
        href={buildUrl({ tag: null })}
        class="inline-flex items-center gap-1 rounded-full border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-2.5 py-1 text-[var(--color-text)]"
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
        <p class="text-sm text-[var(--color-muted)]">No projects match &ldquo;{data.q}&rdquo;.</p>
      {:else if data.tag}
        <p class="text-sm text-[var(--color-muted)]">No projects tagged <strong>{data.tag.name}</strong>.</p>
        <a href="/projects" class="mt-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm">Clear tag filter</a>
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
    <ul class="flex flex-col gap-1">
      {#each rows as p, i (p.id)}
        {@const projectTagList = data.itemTags[p.id] ?? []}
        <li>
          <ProjectRow
            href={`/projects/${p.id}`}
            name={p.name}
            description={p.description}
            status={p.status}
            endDate={p.endDate}
            memberCount={p.memberCount}
            selected={i === selected}
            onDelete={() => del(p.id, p.name)}
          />
          <div class="ml-3 -mt-0.5 flex flex-wrap items-center gap-1 pb-1">
            {#each projectTagList as t (t.id)}
              <a
                href={buildUrl({ tag: t.slug })}
                class="rounded-full bg-[var(--color-highlight-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-text)] hover:underline"
              >{t.name}</a>
            {/each}
            <RowTagAdder
              scope="project"
              entityId={p.id}
              currentTags={projectTagList}
              suggestions={data.allTags}
            />
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
