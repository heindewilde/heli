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
   * Two shapes, because the eight sites are really two groups:
   *
   *   `panel` — the input sits at the top of a Popover panel, list beneath it.
   *   `field` — the input sits in a bordered box alongside selection chips,
   *             and the list floats under that box.
   *
   * Everything else — the debounce, the out-of-order guard, the keyboard, the
   * create row, the ARIA — is shared, which is the whole point.
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
    variant?: 'panel' | 'field';
    placeholder?: string;
    /** Debounce for async searches, ms. 0 for synchronous filtering. */
    debounce?: number;
    /** Run a search immediately on mount, so an empty field still lists options. */
    searchOnOpen?: boolean;
    emptyText?: string;
    /** Fired on Backspace at an empty caret — used by the chip pickers. */
    onBackspaceEmpty?: () => void;
    autoFocus?: boolean;
    disabled?: boolean;
    inputClass?: string;
    listClass?: string;
    /** Selection chips, rendered inside the input row. `field` variant only. */
    chips?: Snippet;
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
    variant = 'panel',
    placeholder = 'Search…',
    debounce = 150,
    searchOnOpen = false,
    emptyText = 'No matches.',
    onBackspaceEmpty,
    autoFocus = true,
    disabled = false,
    inputClass = '',
    listClass = '',
    chips,
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
  let focused = $state(false);
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
  // The panel variant always shows its list (it is the panel's whole content).
  // The field variant only drops a list over the page when there is something
  // in it, which is what the originals did.
  const showList = $derived(variant === 'panel' || (focused && (rowCount > 0 || busy)));

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
    if (!value && !searchOnOpen) {
      seq++; // cancel any in-flight response
      results = [];
      busy = false;
      return;
    }
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
    // enclosing layer, which is the behaviour every panel call site wants.
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

<div class="flex min-w-0 flex-col {variant === 'field' ? 'relative gap-2' : ''}">
  <div
    class={variant === 'panel'
      ? 'flex items-center gap-1.5 border-b border-[var(--color-border)] px-2 py-1.5'
      : 'flex flex-wrap items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5'}
  >
    {#if chips}{@render chips()}{/if}
    <input
      bind:this={inputEl}
      bind:value={query}
      oninput={schedule}
      onkeydown={onKeyDown}
      onfocus={() => {
        focused = true;
        if (searchOnOpen && results.length === 0) run('');
      }}
      onblur={() => {
        // Deferred so a mousedown on an option lands first. The list itself
        // selects on mousedown for the same reason.
        setTimeout(() => (focused = false), 150);
      }}
      type="text"
      role="combobox"
      aria-expanded={showList}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={showList && rowCount > 0 ? optionId(highlight) : undefined}
      {disabled}
      {placeholder}
      class="min-w-0 bg-transparent outline-none placeholder:text-[var(--color-subtle)] {variant ===
      'panel'
        ? 'flex-1 text-xs'
        : 'min-w-[140px] flex-1 px-2 py-1 text-sm'} {inputClass}"
    />
    {#if busy && variant === 'panel'}
      <Loader2 size={12} strokeWidth={2} class="shrink-0 animate-spin text-[var(--color-subtle)]" />
    {/if}
  </div>

  {#if showList}
    <ul
      bind:this={listEl}
      id={listId}
      role="listbox"
      class={variant === 'panel'
        ? `max-h-[40vh] overflow-auto py-1 ${listClass}`
        : `absolute inset-x-0 top-full z-[var(--z-popover)] mt-1 max-h-60 overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)] ${listClass}`}
    >
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
            class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left {variant === 'panel'
              ? 'text-xs'
              : 'px-3 text-sm'} {i === highlight
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
            class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-medium {variant ===
            'panel'
              ? 'text-xs'
              : 'px-3 text-sm'} {results.length > 0 && variant === 'panel'
              ? 'border-t border-[var(--color-border)]'
              : ''} {i === highlight
              ? 'bg-[var(--color-highlight-bg)]'
              : 'hover:bg-[var(--color-surface-2)]'}"
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

      {#if rowCount === 0 && !busy && variant === 'panel'}
        <li class="px-2.5 py-2 text-center text-[11px] text-[var(--color-subtle)]">{emptyText}</li>
      {/if}
    </ul>
  {/if}
</div>
