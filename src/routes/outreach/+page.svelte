<script lang="ts">
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { Send } from 'lucide-svelte';
  import { APP_NAME } from '$lib/branding';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { Search, Plus, Lock, Archive, Trash2, Bell, Building2 } from 'lucide-svelte';
  import { registerCommands } from '$lib/commands/registry.svelte';
  import { toast } from '$lib/toasts.svelte';
  import { OUTREACH_PLATFORMS, PLATFORMS, type OutreachPlatform } from '$lib/outreach/platforms';
  import { PLATFORM_ICONS } from '$lib/outreach/platformIcons';
  import { htmlToPlain } from '$lib/richText';

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
    return s ? `/outreach?${s}` : '/outreach';
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      goto(buildUrl({ q: q.trim() || null }), {
        replaceState: true,
        keepFocus: true,
        noScroll: true
      });
    }, 200);
  }

  async function archive(id: string, name: string, isArchived: number) {
    const res = await fetch(`/api/outreach/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isArchived: !isArchived })
    });
    if (!res.ok) {
      toast.danger('Update failed');
      return;
    }
    toast.success(isArchived ? `Restored ${name}` : `Archived ${name}`);
    await invalidateAll();
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete template "${name}"? Messages already logged are not affected.`)) return;
    const res = await fetch(`/api/outreach/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.danger('Delete failed');
      return;
    }
    toast.success(`Deleted ${name}`);
    await invalidateAll();
  }

  /** First line of the body, as plain text, for the card's one-line preview. */
  function excerpt(body: string): string {
    const text = htmlToPlain(body).split('\n')[0] ?? '';
    return text.length > 90 ? `${text.slice(0, 90)}…` : text;
  }

  onMount(() => {
    const hasRows = () => rows.length > 0;
    const open = () => {
      const r = rows[selected];
      if (r) goto(`/outreach/${r.id}`);
    };
    return registerCommands([
      {
        id: 'list:open',
        title: 'Open the selected template',
        section: 'This page',
        shortcut: 'Enter',
        when: hasRows,
        run: open
      },
      {
        id: 'list:open-e',
        title: 'Open the selected template',
        section: 'This page',
        shortcut: 'e',
        hidden: true,
        when: hasRows,
        run: open
      },
      {
        id: 'list:archive',
        title: 'Toggle archived',
        section: 'This page',
        shortcut: '#',
        when: hasRows,
        run: () => {
          const r = rows[selected];
          if (r) archive(r.id, r.name, r.isArchived);
        }
      }
    ]);
  });

  const ARCHIVED_FILTERS = [
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
    { value: 'all', label: 'All' }
  ] as const;
</script>

<svelte:head>
  <title>Outreach — {APP_NAME}</title>
</svelte:head>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">Outreach</h1>
    <span
      class="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]"
    >
      {data.total}
    </span>
    <div class="ml-auto flex items-center gap-2">
      <a
        href="/outreach/new"
        class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)]"
      >
        <Plus size={14} strokeWidth={2} />
        New template
      </a>
    </div>
  </header>

  <div class="relative">
    <span
      class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-subtle)]"
    >
      <Search size={14} strokeWidth={2} />
    </span>
    <input
      data-search-input
      bind:value={q}
      oninput={onSearchInput}
      type="search"
      placeholder="Search templates…"
      class="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm"
    />
  </div>

  <div class="flex flex-wrap items-center gap-2 text-xs">
    {#each ARCHIVED_FILTERS as f (f.value)}
      <a
        href={buildUrl({ archived: f.value === 'active' ? null : f.value })}
        class="rounded-full border px-2.5 py-1 {data.archived === f.value
          ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
          : 'border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface)]'}"
        >{f.label}</a
      >
    {/each}

    <span class="mx-1 h-4 w-px bg-[var(--color-border)]"></span>

    {#each [{ v: null, label: 'Anyone' }, { v: 'person', label: 'People' }, { v: 'company', label: 'Companies' }] as t (t.label)}
      <a
        href={buildUrl({ target: t.v })}
        class="rounded-full border px-2.5 py-1 {data.target === t.v
          ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
          : 'border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface)]'}"
        >{t.label}</a
      >
    {/each}

    <span class="mx-1 h-4 w-px bg-[var(--color-border)]"></span>

    <a
      href={buildUrl({ platform: null })}
      class="rounded-full border px-2.5 py-1 {data.platform === null
        ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
        : 'border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface)]'}"
      >All platforms</a
    >
    {#each OUTREACH_PLATFORMS as p (p)}
      <a
        href={buildUrl({ platform: p })}
        class="rounded-full border px-2.5 py-1 {data.platform === p
          ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
          : 'border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface)]'}"
        >{PLATFORMS[p].label}</a
      >
    {/each}
  </div>

  {#if rows.length === 0}
    <!-- Copy still branches by cause; EmptyState supplies the form. -->
    {#if data.q}
      <EmptyState icon={Search} title="No matches" description={`Nothing here matches “${data.q}”.`}>
        {#snippet actions()}<Button href="/outreach" variant="secondary">Clear search</Button>{/snippet}
      </EmptyState>
    {:else if data.platform}
      <EmptyState icon={Send} title="Nothing for that platform" description={`No ${PLATFORMS[data.platform as OutreachPlatform].label} templates yet.`}>
        {#snippet actions()}<Button href="/outreach" variant="secondary">All platforms</Button>{/snippet}
      </EmptyState>
    {:else if data.target}
      <EmptyState
        icon={Send}
        title={data.target === 'company' ? 'No company templates yet' : 'No person templates yet'}
        description={data.target === 'company'
          ? 'A company template writes to a company address — run it against a collection of companies, or a selection on the Companies list.'
          : 'A person template writes to one person at a time.'}
      >
        {#snippet actions()}<Button href={`/outreach/new?target=${data.target}`} variant="primary" size="md">Write one</Button>{/snippet}
      </EmptyState>
    {:else if data.archived !== 'active'}
      <EmptyState icon={Send} title="Nothing here" description={`No ${data.archived} templates.`}>
        {#snippet actions()}<Button href="/outreach" variant="secondary">Show active</Button>{/snippet}
      </EmptyState>
    {:else}
      <EmptyState icon={Send} title="No templates yet" description={"Write the messages you send often, once. Heli renders them against a person and you copy the result."}>
        {#snippet actions()}<Button href="/outreach/new" variant="primary" size="md">New template</Button>{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <ul class="flex flex-col gap-2">
      {#each rows as t, i (t.id)}
        {@const Icon = PLATFORM_ICONS[t.platform]}
        <li>
          <div
            class="group flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 transition-colors hover:border-[var(--color-border-strong)] {i ===
            selected
              ? 'border-[var(--color-border-strong)]'
              : ''}"
          >
            <span class="mt-0.5 shrink-0 text-[var(--color-subtle)]">
              <Icon size={16} strokeWidth={2} />
            </span>
            <a href={`/outreach/${t.id}`} class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2">
                <span class="truncate text-sm font-medium">{t.name}</span>
                <span class="text-xs text-[var(--color-subtle)]">{PLATFORMS[t.platform].label}</span
                >
                {#if t.target === 'company'}
                  <span
                    title="Addresses a company, not a person"
                    class="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]"
                  >
                    <Building2 size={10} strokeWidth={2} /> Company
                  </span>
                {/if}
                {#if t.visibility === 'private'}
                  <span
                    title="Only you can see this"
                    class="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]"
                  >
                    <Lock size={10} strokeWidth={2} /> Private
                  </span>
                {/if}
                {#if t.nudgeDays}
                  <span
                    title="Sets a follow-up reminder"
                    class="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]"
                  >
                    <Bell size={10} strokeWidth={2} /> {t.nudgeDays}d
                  </span>
                {/if}
                {#if t.isArchived}
                  <span class="text-[10px] uppercase tracking-wide text-[var(--color-subtle)]"
                    >Archived</span
                  >
                {/if}
              </span>
              <span class="mt-0.5 block truncate text-xs text-[var(--color-muted)]"
                >{excerpt(t.body)}</span
              >
            </a>
            <div
              class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
            >
              <button
                type="button"
                title={t.isArchived ? 'Restore' : 'Archive'}
                onclick={() => archive(t.id, t.name, t.isArchived)}
                class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-bg)]"
              >
                <Archive size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                title="Delete"
                onclick={() => del(t.id, t.name)}
                class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
