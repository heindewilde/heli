<script lang="ts">
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { MessagesSquare } from 'lucide-svelte';
  import { APP_NAME } from '$lib/branding';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Plus, Search } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import InteractionRow from '$lib/components/InteractionRow.svelte';
  import { INTERACTION_TYPES, TYPE_META, dayBucket } from '$lib/interactions';
  import { registerCommands } from '$lib/commands/registry.svelte';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  let q = $state(data.q);
  let timer: ReturnType<typeof setTimeout> | null = null;
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
    return s ? `/interactions?${s}` : '/interactions';
  }

  function onSearchInput() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      goto(buildUrl({ q: q.trim() || null }), { replaceState: true, keepFocus: true, noScroll: true });
    }, 200);
  }

  const groups = $derived.by(() => {
    const today = new Date();
    const map = new Map<string, { label: string; items: typeof rows }>();
    for (const item of rows) {
      const b = dayBucket(item.occurredAt, today);
      const g = map.get(b.key);
      if (g) g.items.push(item);
      else map.set(b.key, { label: b.label, items: [item] });
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  });

  const flatIndexById = $derived.by(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.id, i));
    return m;
  });

  function scrollSelectedIntoView() {
    setTimeout(() => {
      const el = document.querySelectorAll('[data-interaction-row]')[selected] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  onMount(() => {
    const hasRows = () => rows.length > 0;
    const open = () => {
      const r = rows[selected];
      if (r) goto(`/interactions/${r.id}`);
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

  const hasFilters = $derived(!!(data.q || data.type || data.from || data.to));
</script>

<svelte:head>
  <title>Interactions — {APP_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">Interactions</h1>
    <span class="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
      {rows.length}
    </span>
    <div class="ml-auto">
      <a
        href="/interactions/new"
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)]"
      >
        <Plus size={14} strokeWidth={2} />
        Log interaction
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
      placeholder="Search title or body…"
      class="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm"
    />
  </div>

  <div class="flex flex-wrap items-center gap-2 text-xs">
    <a
      href={buildUrl({ type: null })}
      class="rounded-full border px-2.5 py-1 {data.type === null
        ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
        : 'border-[var(--color-border)] text-[var(--color-muted)]'}"
    >All types</a>
    {#each INTERACTION_TYPES as t (t)}
      {@const I = TYPE_META[t].icon}
      <a
        href={buildUrl({ type: t })}
        class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 {data.type === t
          ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
          : 'border-[var(--color-border)] text-[var(--color-muted)]'}"
      >
        <I size={12} strokeWidth={2} />
        {TYPE_META[t].label}
      </a>
    {/each}
  </div>

  <div class="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
    <label class="inline-flex items-center gap-1">
      From
      <input
        type="date"
        value={data.from}
        onchange={(e) => goto(buildUrl({ from: (e.currentTarget as HTMLInputElement).value || null }), { replaceState: true, keepFocus: true })}
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5"
      />
    </label>
    <label class="inline-flex items-center gap-1">
      To
      <input
        type="date"
        value={data.to}
        onchange={(e) => goto(buildUrl({ to: (e.currentTarget as HTMLInputElement).value || null }), { replaceState: true, keepFocus: true })}
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5"
      />
    </label>
    {#if data.from || data.to}
      <a href={buildUrl({ from: null, to: null })} class="underline">Clear dates</a>
    {/if}
  </div>

  {#if groups.length === 0}
    <!-- Copy still branches by cause; EmptyState supplies the form. -->
    {#if hasFilters}
      <EmptyState icon={Search} title="No matches" description={"Nothing matches those filters."}>
        {#snippet actions()}<Button href="/interactions" variant="secondary">Clear filters</Button>{/snippet}
      </EmptyState>
    {:else}
      <EmptyState icon={MessagesSquare} title="No interactions yet" description={"Log a call, a meeting or a note and it starts building a timeline against the people involved."}>
        {#snippet actions()}<Button href="/interactions/new" variant="primary" size="md">Log interaction</Button>{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <div class="flex flex-col gap-6">
      {#each groups as [key, g] (key)}
        <section class="flex flex-col gap-1">
          <h2 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">{g.label}</h2>
          <ul class="flex flex-col gap-0.5">
            {#each g.items as i (i.id)}
              {@const idx = flatIndexById.get(i.id) ?? -1}
              <li>
                <InteractionRow {...i} selected={idx === selected} />
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
</div>
