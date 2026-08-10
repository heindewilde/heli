<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import { goto, preloadData } from '$app/navigation';
  import {
    Search,
    User,
    MessageSquare,
    FolderKanban,
    FolderOpen,
    Funnel,
    Clock,
    CornerDownLeft
  } from 'lucide-svelte';
  import CompanyLogo from './CompanyLogo.svelte';
  import {
    availableCommands,
    prettyShortcut,
    recents,
    rememberRecent,
    type Command
  } from '$lib/commands/registry.svelte';
  import { fuzzyFilter } from '$lib/commands/fuzzy';

  type Hit = {
    kind: 'person' | 'company' | 'interaction' | 'project' | 'collection' | 'pipeline';
    id: string;
    title: string;
    sub: string | null;
    href: string;
    avatarUrl?: string | null;
    logoUrl?: string | null;
    faviconUrl?: string | null;
    domain?: string | null;
  };

  type Row =
    | { type: 'command'; key: string; command: Command }
    | { type: 'hit'; key: string; hit: Hit }
    | { type: 'recent'; key: string; href: string; title: string; kind: string };

  type Props = { open: boolean; onClose: () => void };
  let { open = $bindable(), onClose }: Props = $props();

  let q = $state('');
  let items = $state<Hit[]>([]);
  let highlight = $state(0);
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  let listEl = $state<HTMLElement | undefined>(undefined);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastQuery = $state('');
  let recentList = $state<ReturnType<typeof recents>>([]);

  // Mirror of server's parseQueryScope, used purely to render the active
  // scope chip and the contextual placeholder. Server is the source of truth
  // — passing the prefix through unchanged is fine. `pr:` MUST come before
  // `p:` in the alternation or the regex would parse pr:foo as scope=person.
  const SCOPE_RE = /^(col|pl|pr|p|c|i):\s*(.*)$/i;
  const SCOPE_LABEL: Record<
    string,
    {
      label: string;
      full: 'person' | 'company' | 'interaction' | 'project' | 'collection' | 'pipeline';
    }
  > = {
    p: { label: 'People', full: 'person' },
    c: { label: 'Companies', full: 'company' },
    i: { label: 'Interactions', full: 'interaction' },
    pr: { label: 'Projects', full: 'project' },
    col: { label: 'Collections', full: 'collection' },
    pl: { label: 'Pipelines', full: 'pipeline' }
  };
  const activeScope = $derived.by(() => {
    const m = q.match(SCOPE_RE);
    return m ? SCOPE_LABEL[m[1].toLowerCase()] : null;
  });
  const queryAfterPrefix = $derived(q.match(SCOPE_RE)?.[2] ?? q);

  // Commands are matched on the client — a few dozen known strings, ranked by
  // fuzzy.ts. Entities stay on the server, where FTS5 and its 30s LRU live.
  // A scope prefix means "entities only", so commands drop out entirely.
  const matchedCommands = $derived.by(() => {
    if (activeScope) return [];
    return fuzzyFilter(availableCommands(), q.trim(), (c) => [c.title, ...(c.keywords ?? [])])
      .slice(0, 6)
      .map((s) => s.item);
  });

  const rows = $derived.by<Row[]>(() => {
    if (!q.trim()) {
      return [
        ...recentList.map((r) => ({
          type: 'recent' as const,
          key: `recent:${r.href}`,
          href: r.href,
          title: r.title,
          kind: r.kind
        })),
        ...matchedCommands.map((c) => ({
          type: 'command' as const,
          key: `cmd:${c.id}`,
          command: c
        }))
      ];
    }
    return [
      ...matchedCommands.map((c) => ({ type: 'command' as const, key: `cmd:${c.id}`, command: c })),
      ...items.map((h) => ({ type: 'hit' as const, key: `${h.kind}:${h.id}`, hit: h }))
    ];
  });

  $effect(() => {
    if (open) {
      recentList = recents();
      setTimeout(() => inputEl?.focus(), 10);
    } else {
      q = '';
      items = [];
      highlight = 0;
    }
  });

  // Preload the highlighted destination as the user arrows through. With the
  // streamed detail loads, Enter then paints without a wait.
  $effect(() => {
    const row = rows[highlight];
    if (!row) return;
    const href = row.type === 'hit' ? row.hit.href : row.type === 'recent' ? row.href : null;
    if (href) preloadData(href).catch(() => {});
  });

  function onInput() {
    if (timer) clearTimeout(timer);
    const v = q.trim();
    highlight = 0;
    if (!v) {
      items = [];
      lastQuery = '';
      return;
    }
    timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(v)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { items: Hit[] };
        if (q.trim() !== v) return;
        items = data.items;
        lastQuery = v;
      } catch {
        // ignore
      }
    }, 40);
  }

  function activate(row: Row) {
    if (row.type === 'command') {
      onClose();
      row.command.run();
      return;
    }
    const href = row.type === 'recent' ? row.href : row.hit.href;
    const entry =
      row.type === 'recent'
        ? { kind: row.kind, id: row.href, title: row.title, href }
        : { kind: row.hit.kind, id: row.hit.id, title: row.hit.title, href };
    rememberRecent(entry);
    onClose();
    goto(href);
  }

  function scrollHighlightIntoView() {
    listEl?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  // Escape is not handled here — Dialog's layer owns dismissal, and handling
  // it in both places would close a nested layer and this one on one press.
  function onKey(e: KeyboardEvent) {
    if (
      e.key === 'Backspace' &&
      activeScope &&
      (e.target as HTMLInputElement)?.selectionStart === 0
    ) {
      e.preventDefault();
      q = queryAfterPrefix;
      onInput();
      return;
    }
    if (rows.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight = (highlight + 1) % rows.length;
      scrollHighlightIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight = (highlight - 1 + rows.length) % rows.length;
      scrollHighlightIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[highlight];
      if (row) activate(row);
    }
  }

  const KIND_ICON = {
    interaction: MessageSquare,
    project: FolderKanban,
    collection: FolderOpen,
    pipeline: Funnel,
    person: User
  } as const;

  const KIND_LABEL: Record<Hit['kind'], string> = {
    person: 'Person',
    company: 'Company',
    interaction: 'Interaction',
    project: 'Project',
    collection: 'Collection',
    pipeline: 'Pipeline'
  };

  function getInitials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }

  const placeholder = $derived(
    activeScope ? `Search ${activeScope.label.toLowerCase()}…` : 'Search, or type a command…'
  );

  const emptyHint = $derived.by(() => {
    if (!q.trim()) {
      return activeScope
        ? `Searching ${activeScope.label.toLowerCase()} only — keep typing.`
        : 'Type to search across everything, or start typing a command. Tip: prefix with p:, c:, i:, pr:, col:, or pl: to scope.';
    }
    return lastQuery ? 'No matches.' : 'Searching…';
  });

  // Section headers derive from position rather than being stored on the row,
  // so a header renders exactly when the group above it changes.
  function headerFor(i: number): string | null {
    const row = rows[i];
    const prev = i > 0 ? rows[i - 1] : null;
    if (row.type === 'recent') return prev?.type === 'recent' ? null : 'Recent';
    if (row.type === 'command') {
      const section = row.command.section;
      if (prev?.type === 'command' && prev.command.section === section) return null;
      return section;
    }
    return prev?.type === 'hit' ? null : 'Results';
  }
</script>

<Dialog
  {open}
  onclose={onClose}
  label="Search"
  variant="top"
  panelClass="max-w-lg bg-[var(--color-bg)]"
>
  {#snippet children()}
    <!-- Search input -->
    <div class="flex items-center gap-2.5 px-4 py-3">
      <Search size={15} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
      {#if activeScope}
        <span
          class="inline-flex shrink-0 items-center rounded-full border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text)]"
        >
          {activeScope.label}
        </span>
      {/if}
      <input
        bind:this={inputEl}
        bind:value={q}
        oninput={onInput}
        onkeydown={onKey}
        type="search"
        {placeholder}
        class="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-subtle)]"
      />
    </div>

    <div class="border-t border-[var(--color-border)]"></div>

    <!-- Results -->
    <div bind:this={listEl} class="max-h-[70vh] overflow-auto sm:max-h-[52vh]">
      {#if rows.length === 0}
        <p class="px-4 py-8 text-center text-xs text-[var(--color-muted)]">
          {emptyHint}
        </p>
      {:else}
        <ul class="py-1.5">
          {#each rows as row, i (row.key)}
            {@const header = headerFor(i)}
            {#if header}
              <li
                class="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-[var(--color-subtle)]"
              >
                {header}
              </li>
            {/if}
            <li>
              <button
                type="button"
                data-active={i === highlight}
                onmousedown={(e) => {
                  e.preventDefault();
                  activate(row);
                }}
                onmouseenter={() => (highlight = i)}
                class="flex w-full items-center gap-3 px-3 py-2 text-left {i === highlight
                  ? 'bg-[var(--color-surface)]'
                  : ''}"
              >
                {#if row.type === 'command'}
                  <span
                    class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]"
                  >
                    {#if row.command.icon}
                      <row.command.icon size={13} strokeWidth={2} />
                    {:else}
                      <CornerDownLeft size={13} strokeWidth={2} />
                    {/if}
                  </span>
                  <span class="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]"
                    >{row.command.title}</span
                  >
                  {#if row.command.shortcut}
                    <span class="flex shrink-0 items-center gap-1">
                      {#each prettyShortcut(row.command.shortcut) as k, ki (ki)}
                        <Kbd>{k}</Kbd>
                      {/each}
                    </span>
                  {/if}
                {:else if row.type === 'recent'}
                  <span
                    class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-subtle)]"
                  >
                    <Clock size={13} strokeWidth={2} />
                  </span>
                  <span class="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]"
                    >{row.title}</span
                  >
                {:else}
                  {@const h = row.hit}
                  {#if h.kind === 'company'}
                    <CompanyLogo
                      domain={h.domain}
                      fallbackUrl={h.logoUrl}
                      name={h.title}
                      size={30}
                      rounded="sm"
                    />
                  {:else if h.kind === 'person'}
                    <span
                      class="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[10px] font-medium text-[var(--color-muted)]"
                    >
                      {#if h.avatarUrl}
                        <img
                          src={h.avatarUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          class="h-full w-full object-cover"
                        />
                      {:else}
                        {getInitials(h.title)}
                      {/if}
                    </span>
                  {:else}
                    {@const Icon = KIND_ICON[h.kind as keyof typeof KIND_ICON]}
                    <span
                      class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]"
                    >
                      <Icon size={13} strokeWidth={2} />
                    </span>
                  {/if}

                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-[var(--color-text)]"
                      >{h.title}</span
                    >
                    {#if h.sub}
                      <span class="block truncate text-xs text-[var(--color-muted)]">{h.sub}</span>
                    {/if}
                  </span>
                  <span class="shrink-0 text-[10px] text-[var(--color-subtle)]"
                    >{KIND_LABEL[h.kind]}</span
                  >
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Footer -->
    <div
      class="hidden border-t border-[var(--color-border)] px-4 py-2 text-[10px] text-[var(--color-muted)] sm:block"
    >
      <Kbd>↑↓</Kbd> navigate · <Kbd>↵</Kbd> open · <Kbd>esc</Kbd> close
    </div>
  {/snippet}
</Dialog>
