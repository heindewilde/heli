<script lang="ts">
  import { goto } from '$app/navigation';
  import { APP_NAME } from '$lib/branding';
  import { toast } from '$lib/toasts.svelte';
  import { autofocus } from '$lib/actions';
  import { ArrowLeft, Users } from 'lucide-svelte';

  let { data } = $props();

  type Row = {
    i: number;
    name: string;
    email: string | null;
    role: string | null;
    company: string | null;
    connectedOn: number | null;
  };

  /**
   * The staged list is fixed for the life of this page — it is an in-process
   * snapshot, and the only navigations away from here are commit and cancel — so
   * these derive from `data` once rather than through `$derived`. Re-deriving
   * would also throw away the selection the user has just spent time building.
   */
  // svelte-ignore state_referenced_locally
  const rows = data.rows as Row[];

  /**
   * One lowercase haystack per row, built once. The search re-runs over every
   * staged row on each keystroke, and a LinkedIn export is routinely a few
   * thousand of them.
   */
  const haystacks = rows.map((r) =>
    [r.name, r.company, r.role, r.email].filter(Boolean).join(' ').toLowerCase()
  );

  const SOURCE_LABEL: Record<string, string> = {
    linkedin_csv: 'LinkedIn connections',
    google_contacts: 'Google Contacts'
  };

  /** Only offered when the source records a date; Google Contacts does not. */
  const years = [
    ...new Set(
      rows
        .filter((r) => r.connectedOn !== null)
        .map((r) => new Date(r.connectedOn as number).getUTCFullYear())
    )
  ].sort((a, b) => b - a);

  /**
   * Companies with more than one contact, biggest first. Capped, because an
   * export can carry a thousand distinct employers and a select that long is
   * not a filter. Everything outside the list is still reachable by search.
   */
  const companies = (() => {
    const counts = new Map<string, number>();
    for (const r of rows) if (r.company) counts.set(r.company, (counts.get(r.company) ?? 0) + 1);
    return [...counts]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 50);
  })();

  let q = $state('');
  let emailOnly = $state(false);
  let since = $state(0);
  let company = $state('');

  const needle = $derived(q.trim().toLowerCase());
  const filtered = $derived(
    rows.filter((r) => {
      if (needle && !haystacks[r.i].includes(needle)) return false;
      if (emailOnly && !r.email) return false;
      // A row with no date drops out of a date filter rather than being assumed
      // recent — the export leaves the column blank often enough to matter.
      if (since && (r.connectedOn === null || r.connectedOn < since)) return false;
      if (company && r.company !== company) return false;
      return true;
    })
  );

  /**
   * Everything is selected to begin with, so doing nothing here imports exactly
   * what this flow imported before there was a review step.
   *
   * A `Set` in `$state` is not deep-proxied by Svelte, so every change reassigns.
   * Copying a few thousand numbers per click is cheaper than it looks and much
   * cheaper than an object per row.
   */
  let selected = $state(new Set(rows.map((r) => r.i)));

  /**
   * Bulk actions act on the whole filtered set, not on the 200 rows rendered
   * below. "Select all matching" that quietly meant "the ones you can see" is
   * the bug this feature would be most likely to ship with.
   */
  function selectMatching() {
    const next = new Set(selected);
    for (const r of filtered) next.add(r.i);
    selected = next;
  }

  function deselectMatching() {
    const next = new Set(selected);
    for (const r of filtered) next.delete(r.i);
    selected = next;
  }

  function toggle(i: number) {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    selected = next;
  }

  /** Rendered rows are capped; the count is always the real one. */
  const RENDER_CAP = 200;
  const visible = $derived(filtered.slice(0, RENDER_CAP));

  const monthYear = new Intl.DateTimeFormat('en', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });

  let state_ = $state<'idle' | 'importing' | 'done'>('idle');
  let result = $state<{
    imported: number;
    duplicates: number;
    errors: number;
    deselected: number;
  } | null>(null);

  async function runImport() {
    if (selected.size === 0 || state_ === 'importing') return;
    state_ = 'importing';
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Indices, not rows: the server commits its own staged data.
        body: JSON.stringify({ include: [...selected] })
      });
      if (!res.ok) {
        toast.danger('Import failed. Please try again.');
        state_ = 'idle';
        return;
      }
      result = await res.json();
      state_ = 'done';
    } catch {
      toast.danger('Import failed. Please try again.');
      state_ = 'idle';
    }
  }

  async function cancelImport() {
    await fetch('/api/import', { method: 'DELETE' });
    await goto('/settings');
  }

  const FIELD =
    'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm';
  const BULK = 'rounded-[var(--radius-sm)] px-2 py-1 text-xs hover:bg-[var(--color-surface)]';
  /**
   * One grid template for the header and the rows. Two copies kept in sync by
   * hand is how a column gets added to one and not the other.
   */
  const GRID =
    'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[auto_minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_5.5rem]';
</script>

<svelte:head>
  <title>Review import — {APP_NAME}</title>
</svelte:head>

<article class="flex flex-col gap-6">
  <header class="flex flex-col gap-1">
    <a
      href="/settings"
      class="inline-flex w-fit items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-fg)]"
    >
      <ArrowLeft size={14} strokeWidth={2} /> Settings
    </a>
    <h1 class="text-2xl font-semibold tracking-tight">Review import</h1>
    <p class="text-sm text-[var(--color-muted)]">
      {rows.length.toLocaleString()} contact{rows.length !== 1 ? 's' : ''} from {SOURCE_LABEL[
        data.source
      ] ?? 'your address book'}, ready to import.
      {#if data.duplicateCount > 0}
        {data.duplicateCount.toLocaleString()} already in {APP_NAME} and left out.
      {/if}
    </p>
  </header>

  {#if state_ === 'done' && result}
    <section
      class="flex flex-col items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
    >
      <h2 class="flex items-center gap-2 text-sm font-medium">
        <Users size={14} strokeWidth={2} /> Imported {result.imported.toLocaleString()} contact{result.imported !==
        1
          ? 's'
          : ''}
      </h2>
      <p class="text-sm text-[var(--color-muted)]">
        {#if result.duplicates > 0}
          {result.duplicates.toLocaleString()} already existed and were skipped.
        {/if}
        {#if result.deselected > 0}
          {result.deselected.toLocaleString()} you left out were discarded — upload the file again
          to pick from them.
        {/if}
        {#if result.errors > 0}
          {result.errors.toLocaleString()} could not be written.
        {/if}
      </p>
      <div class="flex items-center gap-2">
        <a
          href="/people"
          class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)]"
          >View people</a
        >
        <a
          href="/settings"
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-surface)]"
          >Back to settings</a
        >
      </div>
    </section>
  {:else}
    <section class="flex flex-col gap-3">
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
          <span class="text-[var(--color-muted)]">Search</span>
          <input
            class={FIELD}
            type="search"
            placeholder="Name, company, role or email"
            bind:value={q}
            use:autofocus
          />
        </label>

        {#if years.length > 0}
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-[var(--color-muted)]">Connected since</span>
            <select class={FIELD} bind:value={since}>
              <option value={0}>Any time</option>
              {#each years as year}
                <option value={Date.UTC(year, 0, 1)}>{year}</option>
              {/each}
            </select>
          </label>
        {/if}

        {#if companies.length > 0}
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-[var(--color-muted)]">Company</span>
            <select class="{FIELD} max-w-[14rem]" bind:value={company}>
              <option value="">Any company</option>
              {#each companies as [name, n]}
                <option value={name}>{name} ({n})</option>
              {/each}
            </select>
          </label>
        {/if}

        <label class="flex items-center gap-2 py-2 text-sm">
          <input type="checkbox" bind:checked={emailOnly} />
          Has an email address
        </label>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-[var(--color-muted)]">
          {filtered.length.toLocaleString()} matching · {selected.size.toLocaleString()} selected
        </span>
        <span class="flex items-center gap-1">
          <button type="button" class={BULK} onclick={selectMatching}>Select matching</button>
          <button type="button" class={BULK} onclick={deselectMatching}>Deselect matching</button>
          <button type="button" class={BULK} onclick={() => (selected = new Set())}>Clear all</button
          >
        </span>
      </div>

      <div
        class="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]"
      >
        <div
          class="{GRID} border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-muted)]"
        >
          <span class="w-4" aria-hidden="true"></span>
          <span>Name</span>
          <span class="hidden sm:block">Company</span>
          <span class="hidden sm:block">Role</span>
          <span class="hidden sm:block">Connected</span>
        </div>

        {#if filtered.length === 0}
          <p class="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
            No staged contacts match those filters.
          </p>
        {:else}
          <ul>
            {#each visible as row (row.i)}
              <li>
                <label
                  class="{GRID} cursor-pointer border-b border-[var(--color-border)] px-3 py-2 text-sm last:border-b-0 hover:bg-[var(--color-surface)]"
                >
                  <input
                    type="checkbox"
                    class="w-4"
                    checked={selected.has(row.i)}
                    onchange={() => toggle(row.i)}
                  />
                  <span class="min-w-0">
                    <span class="block truncate font-medium">{row.name}</span>
                    {#if row.email}
                      <span class="block truncate text-xs text-[var(--color-subtle)]">{row.email}</span>
                    {/if}
                  </span>
                  <span class="hidden truncate text-[var(--color-muted)] sm:block"
                    >{row.company ?? '—'}</span
                  >
                  <span class="hidden truncate text-[var(--color-muted)] sm:block"
                    >{row.role ?? '—'}</span
                  >
                  <span class="hidden text-xs text-[var(--color-subtle)] sm:block">
                    {row.connectedOn ? monthYear.format(row.connectedOn) : '—'}
                  </span>
                </label>
              </li>
            {/each}
          </ul>
          {#if filtered.length > visible.length}
            <p
              class="border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-subtle)]"
            >
              Showing {visible.length} of {filtered.length.toLocaleString()} matching. Selecting and
              importing still act on all {filtered.length.toLocaleString()} — narrow the filters to
              see the rest.
            </p>
          {/if}
        {/if}
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onclick={runImport}
          disabled={state_ === 'importing' || selected.size === 0}
          class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
        >
          {state_ === 'importing'
            ? 'Importing…'
            : `Import ${selected.size.toLocaleString()} contact${selected.size !== 1 ? 's' : ''}`}
        </button>
        <button
          type="button"
          onclick={cancelImport}
          disabled={state_ === 'importing'}
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-surface)] disabled:opacity-60"
          >Cancel</button
        >
        <span class="text-xs text-[var(--color-subtle)]">
          Whatever you leave out is discarded, not remembered.
        </span>
      </div>
    </section>
  {/if}
</article>
