<script lang="ts">
  /**
   * Review a pasted list of links before it becomes records.
   *
   * Modelled directly on `/settings/import`, and the patterns it borrows are
   * the ones that screen documents: `rows` read **once** rather than derived
   * (re-deriving would discard the user's selection), one prebuilt lowercase
   * haystack per row so search is keystroke-fast, a render cap that is stated
   * rather than silent, and bulk actions that act on the *filtered* set rather
   * than on what happens to be on screen.
   */
  import { APP_NAME } from '$lib/branding';
  import { goto, invalidateAll } from '$app/navigation';
  import { Search, Loader2, User, Building2, ArrowLeft } from 'lucide-svelte';
  import Checkbox from '$lib/ui/Checkbox.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Select from '$lib/ui/Select.svelte';
  import SegmentedControl from '$lib/ui/SegmentedControl.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { readErrorCode } from '$lib/api-error';

  let { data } = $props();

  type Row = (typeof data.rows)[number];
  type Kind = 'person' | 'company';

  // Read once, not `$derived`: re-deriving on any invalidation would throw away
  // the selection and the kind overrides the user has been making.
  // svelte-ignore state_referenced_locally
  const rows = data.rows as Row[];

  // One lowercase haystack per row, built once, so filtering stays instant on
  // 500 rows without a search index.
  const haystacks = rows.map((r) => `${r.url} ${r.host} ${r.suggestedName}`.toLowerCase());

  let q = $state('');
  let kindFilter = $state<'all' | Kind>('all');
  let hideDuplicates = $state(true);

  /** Per-row overrides, keyed by index — exactly what the commit body takes. */
  let kinds = $state<Record<number, Kind>>({});
  const kindOf = (r: Row): Kind => kinds[r.i] ?? (r.kind as Kind);

  let selected = $state(new Set(rows.filter((r) => !r.existingId).map((r) => r.i)));

  const filtered = $derived.by(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !haystacks[r.i].includes(needle)) return false;
      if (kindFilter !== 'all' && kindOf(r) !== kindFilter) return false;
      if (hideDuplicates && r.existingId) return false;
      return true;
    });
  });

  /**
   * A stated cap beats a virtual-list dependency, and "select all matching"
   * that quietly meant "the ones on screen" is the bug this screen would
   * otherwise ship with — so every bulk control below acts on `filtered`.
   */
  const RENDER_CAP = 200;
  const visible = $derived(filtered.slice(0, RENDER_CAP));

  const selectableCount = $derived(rows.filter((r) => !r.existingId).length);

  // A Set in `$state` is not deep-proxied, so every mutation reassigns.
  function toggle(i: number) {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    selected = next;
  }

  function selectMatching() {
    const next = new Set(selected);
    for (const r of filtered) if (!r.existingId) next.add(r.i);
    selected = next;
  }

  function deselectMatching() {
    const next = new Set(selected);
    for (const r of filtered) next.delete(r.i);
    selected = next;
  }

  function setKind(i: number, kind: Kind) {
    kinds = { ...kinds, [i]: kind };
  }

  function setKindMatching(kind: Kind) {
    const next = { ...kinds };
    for (const r of filtered) next[r.i] = kind;
    kinds = next;
  }

  /** Pasted LinkedIn profiles never enrich — see `servesAuthwall`. */
  const linkedinCount = $derived(
    rows.filter((r) => selected.has(r.i) && /(^|\.)linkedin\.com$/.test(r.host)).length
  );

  let state_ = $state<'idle' | 'importing' | 'done'>('idle');
  let result = $state<{
    imported: number;
    skipped: number;
    errors: number;
    enqueued: number;
    dropped: number;
  } | null>(null);

  const ERRORS: Record<string, string> = {
    empty_selection: 'Nothing is selected.',
    nothing_staged: 'That paste has expired — paste the links again.'
  };

  async function commit() {
    if (state_ === 'importing' || selected.size === 0) return;
    state_ = 'importing';
    try {
      const res = await fetch('/api/import/urls/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          include: [...selected],
          // Only the overrides. Absent means "keep what we classified".
          kinds: Object.fromEntries(Object.entries(kinds).filter(([i]) => selected.has(Number(i))))
        })
      });
      if (!res.ok) {
        toast.danger(ERRORS[await readErrorCode(res)] ?? 'Import failed');
        state_ = 'idle';
        return;
      }
      result = await res.json();
      state_ = 'done';
    } catch {
      toast.danger('Import failed');
      state_ = 'idle';
    }
  }

  async function discard() {
    await fetch('/api/import/urls', { method: 'DELETE' });
    await invalidateAll();
    goto(data.back);
  }

  const GRID =
    'grid grid-cols-[auto_minmax(0,1fr)] gap-3 sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1.6fr)_11rem]';
</script>

<svelte:head>
  <title>Review links — {APP_NAME}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <a
      href={data.back}
      aria-label="Back"
      class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
    >
      <ArrowLeft size={16} strokeWidth={2} />
    </a>
    <div class="min-w-0 flex-1">
      <h1 class="text-xl font-semibold tracking-tight">Review links</h1>
      <p class="mt-0.5 text-xs text-[var(--color-muted)]">
        {rows.length}
        {rows.length === 1 ? 'link' : 'links'} found.
        {#if data.duplicates > 0}
          {data.duplicates} already in your workspace.
        {/if}
        {#if data.invalid > 0}
          {data.invalid} could not be read as a link.
        {/if}
      </p>
    </div>
  </header>

  {#if state_ === 'done' && result}
    <div
      class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
    >
      <p class="text-sm font-medium">
        Added {result.imported}
        {result.imported === 1 ? 'record' : 'records'}.
      </p>
      <p class="text-sm text-[var(--color-muted)]">
        {#if result.enqueued > 0}
          {result.enqueued} are being filled in now — names, logos and links appear over the next
          few minutes.
        {/if}
        {#if result.skipped > 0}
          {result.skipped} were already in your workspace.
        {/if}
        {#if result.errors > 0}
          {result.errors} could not be saved.
        {/if}
        {#if result.dropped > 0}
          {result.dropped} were saved but are waiting — the enrichment queue is full.
        {/if}
      </p>
      <div class="mt-2 flex gap-2">
        <Button href={data.back} variant="primary">Back to the list</Button>
      </div>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      <div class="relative">
        <span
          class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-subtle)]"
        >
          <Search size={14} strokeWidth={2} />
        </span>
        <input
          bind:value={q}
          type="search"
          placeholder="Filter links…"
          class="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm outline-none focus:border-[var(--color-border-strong)]"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2 text-xs">
        <SegmentedControl
          label="Kind"
          size="sm"
          segments={[
            { value: 'all', label: 'All' },
            { value: 'person', label: 'People' },
            { value: 'company', label: 'Companies' }
          ]}
          value={kindFilter}
          onchange={(v) => (kindFilter = v as 'all' | Kind)}
        />
        <Checkbox bind:checked={hideDuplicates} label="Hide ones I already have" />

        <span class="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" onclick={selectMatching} class="underline text-[var(--color-muted)]"
            >Select all {filtered.length} matching</button
          >
          <span class="text-[var(--color-subtle)]">·</span>
          <button type="button" onclick={deselectMatching} class="underline text-[var(--color-muted)]"
            >Deselect</button
          >
          <span class="text-[var(--color-subtle)]">·</span>
          <button
            type="button"
            onclick={() => setKindMatching('person')}
            class="underline text-[var(--color-muted)]">All are people</button
          >
          <span class="text-[var(--color-subtle)]">·</span>
          <button
            type="button"
            onclick={() => setKindMatching('company')}
            class="underline text-[var(--color-muted)]">All are companies</button
          >
        </span>
      </div>

      {#if linkedinCount > 0}
        <p
          class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-muted)]"
        >
          {linkedinCount} of these are LinkedIn profiles. LinkedIn serves us a sign-up wall, so
          those are saved with a name taken from the URL and nothing else — open one and the browser
          extension can fill in the rest.
        </p>
      {/if}

      <div
        class="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <div
          class="{GRID} border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-subtle)]"
        >
          <span><span class="sr-only">Include</span></span>
          <span>Name</span>
          <span class="hidden sm:block">Link</span>
          <span class="hidden sm:block">Kind</span>
        </div>

        <ul role="list">
          {#each visible as r (r.i)}
            {@const kind = kindOf(r)}
            <li
              class="{GRID} items-center border-b border-[var(--color-border)] px-3 py-2 last:border-b-0 {r.existingId
                ? 'opacity-60'
                : ''}"
            >
              <Checkbox
                checked={selected.has(r.i)}
                disabled={!!r.existingId}
                aria-label={`Include ${r.suggestedName}`}
                onclick={(e) => {
                  e.preventDefault();
                  if (!r.existingId) toggle(r.i);
                }}
              />
              <span class="min-w-0">
                <span class="block truncate text-sm">{r.suggestedName}</span>
                {#if r.existingId}
                  <span class="block text-[11px] text-[var(--color-subtle)]">Already saved</span>
                {:else}
                  <span class="block truncate text-[11px] text-[var(--color-subtle)] sm:hidden"
                    >{r.url}</span
                  >
                {/if}
              </span>
              <span class="hidden min-w-0 sm:block">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block truncate text-xs text-[var(--color-muted)] hover:underline">{r.url}</a
                >
              </span>
              <span class="hidden sm:block">
                <Select
                  size="sm"
                  label="Kind"
                  value={kind}
                  disabled={!!r.existingId}
                  options={[
                    { value: 'person', label: 'Person' },
                    { value: 'company', label: 'Company' }
                  ]}
                  onchange={(v) => setKind(r.i, v as Kind)}
                />
              </span>
              <!-- Below sm the Select would not fit; two icon buttons do. -->
              <span class="col-start-2 flex gap-1 sm:hidden">
                <button
                  type="button"
                  disabled={!!r.existingId}
                  onclick={() => setKind(r.i, 'person')}
                  aria-pressed={kind === 'person'}
                  class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] {kind ===
                  'person'
                    ? 'border-[var(--color-border-strong)] bg-[var(--color-highlight-bg)]'
                    : 'border-[var(--color-border)] text-[var(--color-muted)]'}"
                >
                  <User size={10} strokeWidth={2} /> Person
                </button>
                <button
                  type="button"
                  disabled={!!r.existingId}
                  onclick={() => setKind(r.i, 'company')}
                  aria-pressed={kind === 'company'}
                  class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] {kind ===
                  'company'
                    ? 'border-[var(--color-border-strong)] bg-[var(--color-highlight-bg)]'
                    : 'border-[var(--color-border)] text-[var(--color-muted)]'}"
                >
                  <Building2 size={10} strokeWidth={2} /> Company
                </button>
              </span>
            </li>
          {/each}
        </ul>

        {#if filtered.length > RENDER_CAP}
          <p class="border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-subtle)]">
            Showing {RENDER_CAP} of {filtered.length}. Selecting and importing still act on all of
            them.
          </p>
        {/if}
        {#if filtered.length === 0}
          <p class="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
            Nothing matches that filter.
          </p>
        {/if}
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-[var(--color-muted)]">
          {selected.size} of {selectableCount} selected
        </span>
        <span class="ml-auto flex gap-2">
          <Button variant="secondary" onclick={discard}>Discard</Button>
          <Button variant="primary" onclick={commit} disabled={selected.size === 0 || state_ === 'importing'}>
            {#if state_ === 'importing'}
              <Loader2 size={14} strokeWidth={2} class="animate-spin" />
              Importing…
            {:else}
              Import {selected.size}
            {/if}
          </Button>
        </span>
      </div>
    </div>
  {/if}
</div>
