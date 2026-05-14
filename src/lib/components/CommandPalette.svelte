<script lang="ts">
  import { goto } from '$app/navigation';
  import { Search, User, MessageSquare, FolderKanban, FolderOpen, Funnel } from 'lucide-svelte';
  import CompanyLogo from './CompanyLogo.svelte';
  import { logoDevUrl } from '$lib/logo';

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

  type Props = { open: boolean; onClose: () => void };
  let { open = $bindable(), onClose }: Props = $props();

  let q = $state('');
  let items = $state<Hit[]>([]);
  let highlight = $state(0);
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastQuery = $state('');

  // Mirror of server's parseQueryScope, used purely to render the active
  // scope chip and the contextual placeholder. Server is the source of truth
  // — passing the prefix through unchanged is fine. `pr:` MUST come before
  // `p:` in the alternation or the regex would parse pr:foo as scope=person.
  const SCOPE_RE = /^(col|pl|pr|p|c|i):\s*(.*)$/i;
  const SCOPE_LABEL: Record<string, { label: string; full: 'person' | 'company' | 'interaction' | 'project' | 'collection' | 'pipeline' }> = {
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

  $effect(() => {
    if (open) {
      setTimeout(() => inputEl?.focus(), 10);
    } else {
      q = '';
      items = [];
      highlight = 0;
    }
  });

  function onInput() {
    if (timer) clearTimeout(timer);
    const v = q.trim();
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
        highlight = 0;
        lastQuery = v;
      } catch {
        // ignore
      }
    }, 120);
  }

  function pick(h: Hit) {
    onClose();
    goto(h.href);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Backspace' && activeScope && (e.target as HTMLInputElement)?.selectionStart === 0) {
      e.preventDefault();
      q = queryAfterPrefix;
      onInput();
      return;
    }
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight = Math.min(items.length - 1, highlight + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight = Math.max(0, highlight - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const h = items[highlight];
      if (h) pick(h);
    }
  }

  const KIND_ICON = {
    person: User,
    interaction: MessageSquare,
    project: FolderKanban,
    collection: FolderOpen,
    pipeline: Funnel
  } as const;

  const KIND_LABEL = {
    person: 'Person',
    company: 'Company',
    interaction: 'Interaction',
    project: 'Project',
    collection: 'Collection',
    pipeline: 'Pipeline'
  } as const;

  function getInitials(name: string): string {
    return name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  const placeholder = $derived(
    activeScope
      ? `Search ${activeScope.label.toLowerCase()}…`
      : 'Search people, companies, interactions…'
  );

  const emptyHint = $derived.by(() => {
    if (!q.trim()) {
      return activeScope
        ? `Searching ${activeScope.label.toLowerCase()} only — keep typing.`
        : 'Type to search across everything. Tip: prefix with p:, c:, i:, pr:, col:, or pl: to scope.';
    }
    return lastQuery ? 'No matches.' : 'Searching…';
  });
</script>

{#if open}
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Search"
    tabindex="-1"
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[5vh] sm:pt-[12vh]"
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    onkeydown={onKey}
  >
    <div class="w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-[var(--shadow-lg)]">
      <!-- Search input -->
      <div class="flex items-center gap-2.5 px-4 py-3">
        <Search size={15} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
        {#if activeScope}
          <span class="inline-flex shrink-0 items-center rounded-full border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text)]">
            {activeScope.label}
          </span>
        {/if}
        <input
          bind:this={inputEl}
          bind:value={q}
          oninput={onInput}
          type="search"
          {placeholder}
          class="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-subtle)]"
        />
      </div>

      <div class="border-t border-[var(--color-border)]"></div>

      <!-- Results -->
      <div class="max-h-[70vh] overflow-auto sm:max-h-[52vh]">
        {#if items.length === 0}
          <p class="px-4 py-8 text-center text-xs text-[var(--color-muted)]">
            {emptyHint}
          </p>
        {:else}
          <ul class="py-1.5">
            {#each items as h, i (h.kind + ':' + h.id)}
              <li>
                <button
                  type="button"
                  onmousedown={(e) => { e.preventDefault(); pick(h); }}
                  onmouseenter={() => (highlight = i)}
                  class="flex w-full items-center gap-3 px-3 py-2 text-left {i === highlight ? 'bg-[var(--color-surface)]' : ''}"
                >
                  <!-- Avatar / Logo slot -->
                  {#if h.kind === 'company'}
                    <CompanyLogo domain={h.domain} fallbackUrl={h.logoUrl} name={h.title} size={30} rounded="sm" />
                  {:else if h.kind === 'person'}
                    <span class="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[10px] font-medium text-[var(--color-muted)]">
                      {#if h.avatarUrl}
                        <img src={h.avatarUrl} alt="" loading="lazy" decoding="async" class="h-full w-full object-cover" />
                      {:else}
                        {getInitials(h.title)}
                      {/if}
                    </span>
                  {:else}
                    {@const Icon = KIND_ICON[h.kind as keyof typeof KIND_ICON]}
                    <span class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
                      <Icon size={13} strokeWidth={2} />
                    </span>
                  {/if}

                  <!-- Title + sub -->
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-[var(--color-text)]">{h.title}</span>
                    {#if h.sub}
                      <span class="block truncate text-xs text-[var(--color-muted)]">{h.sub}</span>
                    {/if}
                  </span>

                  <!-- Kind label -->
                  <span class="shrink-0 text-[10px] text-[var(--color-subtle)]">{KIND_LABEL[h.kind]}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Footer -->
      <div class="hidden border-t border-[var(--color-border)] px-4 py-2 text-[10px] text-[var(--color-muted)] sm:block">
        <kbd>↑↓</kbd> navigate · <kbd>enter</kbd> open · <kbd>esc</kbd> close
      </div>
    </div>
  </div>
{/if}
