<script lang="ts">
  import { goto } from '$app/navigation';
  import { Search, User, Building2, MessageSquare, FolderKanban, FolderOpen, GitBranch } from 'lucide-svelte';

  type Hit = {
    kind: 'person' | 'company' | 'interaction' | 'project' | 'collection' | 'pipeline';
    id: string;
    title: string;
    sub: string | null;
    href: string;
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
        // Drop stale results if the user has already moved on.
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
    // Backspace at the start of the input clears the active scope prefix in
    // one tap so users can broaden their search without selecting the colon.
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
    company: Building2,
    interaction: MessageSquare,
    project: FolderKanban,
    collection: FolderOpen,
    pipeline: GitBranch
  } as const;
  const KIND_TAG = {
    person: 'P',
    company: 'C',
    interaction: 'I',
    project: 'PR',
    collection: 'COL',
    pipeline: 'PL'
  } as const;

  const placeholder = $derived(
    activeScope
      ? `Search ${activeScope.label.toLowerCase()}…`
      : 'Search people, companies, interactions, collections, pipelines…'
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
    aria-label="Search Gusto"
    tabindex="-1"
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    onkeydown={onKey}
  >
    <div class="w-full max-w-xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]">
      <div class="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <Search size={14} strokeWidth={2} class="text-[var(--color-subtle)]" />
        {#if activeScope}
          <span class="inline-flex items-center gap-1 rounded-full border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text)]">
            {activeScope.label} only
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
        <kbd class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">esc</kbd>
      </div>
      <div class="max-h-[60vh] overflow-auto">
        {#if items.length === 0}
          <p class="px-3 py-6 text-center text-xs text-[var(--color-muted)]">
            {emptyHint}
          </p>
        {:else}
          <ul class="py-1">
            {#each items as h, i (h.kind + ':' + h.id)}
              {@const Icon = KIND_ICON[h.kind]}
              <li>
                <button
                  type="button"
                  onmousedown={(e) => { e.preventDefault(); pick(h); }}
                  onmouseenter={() => (highlight = i)}
                  class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm {i === highlight ? 'bg-[var(--color-highlight-bg)]' : ''}"
                >
                  <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-muted)]">
                    <Icon size={14} strokeWidth={2} />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium">{h.title}</span>
                    {#if h.sub}
                      <span class="block truncate text-xs text-[var(--color-muted)]">{h.sub}</span>
                    {/if}
                  </span>
                  <span class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">{KIND_TAG[h.kind]}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <div class="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-3 py-1.5 text-[10px] text-[var(--color-muted)]">
        <span><kbd>↑↓</kbd> navigate · <kbd>enter</kbd> open · <kbd>esc</kbd> close</span>
        <span class="hidden sm:inline">scope: <kbd>p:</kbd> people · <kbd>c:</kbd> companies · <kbd>i:</kbd> interactions</span>
      </div>
    </div>
  </div>
{/if}
