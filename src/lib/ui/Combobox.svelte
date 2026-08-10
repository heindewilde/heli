<script lang="ts" generics="T">
  /**
   * Type to filter, arrow to pick, Enter to create.
   *
   * This loop was reimplemented eight times across the app — the status cell,
   * the row tag adder, the person / company / project / pipeline pickers, the
   * in-row company cell and the collection form — each with its own debounce,
   * its own highlight arithmetic and its own create affordance. It is also the
   * exact interaction that "getting data in" runs through, so it is worth
   * having one correct copy.
   *
   * `search` may be synchronous (filter an array you already have) or async
   * (hit an endpoint). Async searches are debounced and guarded against
   * out-of-order responses, which several of the originals were not.
   */
  import type { Snippet } from 'svelte';
  import { Loader2, Plus } from 'lucide-svelte';

  type Props = {
    /** Returns the options for a query. Called with '' when the field opens empty. */
    search: (query: string) => T[] | Promise<T[]>;
    /** Stable identity for keying and highlight comparison. */
    getId: (item: T) => string;
    onSelect: (item: T) => void;
    /** Omit to disable the create affordance. */
    onCreate?: (query: string) => void | Promise<void>;
    /** Label for the create row; receives the trimmed query. */
    createLabel?: (query: string) => string;
    /** Suppress "create" when the query already matches an option exactly. */
    canCreate?: (query: string, results: T[]) => boolean;
    placeholder?: string;
    /** Debounce for async searches, ms. 0 for synchronous filtering. */
    debounce?: number;
    /** Run a search immediately on mount, so an empty field still lists options. */
    searchOnOpen?: boolean;
    emptyText?: string;
    /** Fired on Backspace at an empty caret — used by the chip pickers. */
    onBackspaceEmpty?: () => void;
    autoFocus?: boolean;
    inputClass?: string;
    listClass?: string;
    /** Renders one option. Gets the item and whether it is highlighted. */
    option: Snippet<[T, boolean]>;
  };

  let {
    search,
    getId,
    onSelect,
    onCreate,
    createLabel = (q) => `Create “${q}”`,
    canCreate,
    placeholder = 'Search…',
    debounce = 150,
    searchOnOpen = false,
    emptyText = 'No matches.',
    onBackspaceEmpty,
    autoFocus = true,
    inputClass = '',
    listClass = '',
    option
  }: Props = $props();

  const uid = $props.id();
  const listId = `combobox-${uid}-list`;
  const optionId = (i: number) => `combobox-${uid}-opt-${i}`;

  let query = $state('');
  let results = $state<T[]>([]);
  let highlight = $state(0);
  let busy = $state(false);
  let creating = $state(false);
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  let listEl = $state<HTMLElement | undefined>(undefined);

  let timer: ReturnType<typeof setTimeout> | null = null;
  // Monotonic token: an earlier slow response must not overwrite a later fast
  // one. The originals raced here.
  let seq = 0;

  const trimmed = $derived(query.trim());
  const showCreate = $derived(
    !!onCreate && trimmed.length > 0 && (canCreate ? canCreate(trimmed, results) : true)
  );
  const rowCount = $derived(results.length + (showCreate ? 1 : 0));

  async function run(value: string) {
    const mine = ++seq;
    busy = true;
    try {
      const out = await search(value);
      if (mine !== seq) return;
      results = out;
      highlight = 0;
    } finally {
      if (mine === seq) busy = false;
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    const value = query.trim();
    if (debounce === 0) {
      run(value);
      return;
    }
    timer = setTimeout(() => run(value), debounce);
  }

  export function focus() {
    inputEl?.focus();
  }

  export function reset() {
    query = '';
    results = [];
    highlight = 0;
  }

  async function create() {
    if (!onCreate || !trimmed || creating) return;
    creating = true;
    try {
      await onCreate(trimmed);
    } finally {
      creating = false;
    }
  }

  function commit(index: number) {
    if (index < results.length) {
      const item = results[index];
      if (item !== undefined) onSelect(item);
      return;
    }
    if (showCreate) create();
  }

  function scrollHighlightIntoView() {
    listEl?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight = rowCount === 0 ? 0 : (highlight + 1) % rowCount;
      scrollHighlightIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight = rowCount === 0 ? 0 : (highlight - 1 + rowCount) % rowCount;
      scrollHighlightIntoView();
    } else if (e.key === 'Enter') {
      if (rowCount === 0) return;
      e.preventDefault();
      commit(highlight);
    } else if (e.key === 'Backspace' && query === '') {
      onBackspaceEmpty?.();
    }
    // Escape is deliberately not handled here — layerStack dismisses the
    // enclosing layer, which is the behaviour every call site wants.
  }

  $effect(() => {
    if (searchOnOpen) run('');
  });

  $effect(() => {
    if (autoFocus) inputEl?.focus();
  });

  $effect(() => () => {
    if (timer) clearTimeout(timer);
  });
</script>

<div class="flex min-w-0 flex-col">
  <div class="flex items-center gap-1.5 border-b border-[var(--color-border)] px-2 py-1.5">
    <input
      bind:this={inputEl}
      bind:value={query}
      oninput={schedule}
      onkeydown={onKeyDown}
      type="text"
      role="combobox"
      aria-expanded="true"
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={rowCount > 0 ? optionId(highlight) : undefined}
      {placeholder}
      class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--color-subtle)] {inputClass}"
    />
    {#if busy}
      <Loader2 size={12} strokeWidth={2} class="shrink-0 animate-spin text-[var(--color-subtle)]" />
    {/if}
  </div>

  <ul bind:this={listEl} id={listId} role="listbox" class="max-h-[40vh] overflow-auto py-1 {listClass}">
    {#each results as item, i (getId(item))}
      <li>
        <button
          type="button"
          role="option"
          id={optionId(i)}
          aria-selected={i === highlight}
          data-active={i === highlight}
          onmouseenter={() => (highlight = i)}
          onmousedown={(e) => {
            // mousedown, not click: the press must beat the blur that would
            // otherwise tear this list down before the selection lands.
            e.preventDefault();
            onSelect(item);
          }}
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs {i === highlight
            ? 'bg-[var(--color-highlight-bg)]'
            : 'hover:bg-[var(--color-surface-2)]'}"
        >
          {@render option(item, i === highlight)}
        </button>
      </li>
    {/each}

    {#if showCreate}
      {@const i = results.length}
      <li>
        <button
          type="button"
          role="option"
          id={optionId(i)}
          aria-selected={i === highlight}
          data-active={i === highlight}
          disabled={creating}
          onmouseenter={() => (highlight = i)}
          onmousedown={(e) => {
            e.preventDefault();
            create();
          }}
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium {results.length >
          0
            ? 'border-t border-[var(--color-border)]'
            : ''} {i === highlight ? 'bg-[var(--color-highlight-bg)]' : 'hover:bg-[var(--color-surface-2)]'}"
        >
          {#if creating}
            <Loader2 size={11} strokeWidth={2.5} class="shrink-0 animate-spin" />
          {:else}
            <Plus size={11} strokeWidth={2.5} class="shrink-0" />
          {/if}
          <span class="truncate">{createLabel(trimmed)}</span>
        </button>
      </li>
    {/if}

    {#if rowCount === 0 && !busy}
      <li class="px-2.5 py-2 text-center text-[11px] text-[var(--color-subtle)]">{emptyText}</li>
    {/if}
  </ul>
</div>
