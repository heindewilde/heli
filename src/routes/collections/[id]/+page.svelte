<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import {
    Trash2,
    Archive,
    X,
    FolderOpen,
    Funnel,
    Search,
    Users,
    Building2,
    Layers,
    Plus,
    Rows3,
    LayoutGrid,
    ArrowUpDown
  } from 'lucide-svelte';
  import CollectionIcon from '$lib/components/CollectionIcon.svelte';
  import CollectionMemberCard from '$lib/components/CollectionMemberCard.svelte';
  import CompanyLogo from '$lib/components/CompanyLogo.svelte';
  import PersonPicker from '$lib/components/PersonPicker.svelte';
  import CompanyPicker from '$lib/components/CompanyPicker.svelte';
  import NotesEditor from '$lib/components/NotesEditor.svelte';
  import Avatar from '$lib/ui/Avatar.svelte';
  import Button from '$lib/ui/Button.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Popover from '$lib/ui/Popover.svelte';
  import SegmentedControl from '$lib/ui/SegmentedControl.svelte';
  import Select from '$lib/ui/Select.svelte';
  import { readViewPref, writeViewPref } from '$lib/client/viewPref';
  import { toast } from '$lib/toasts.svelte';
  import type { CollectionMemberDetail } from '$lib/server/collections';

  let { data } = $props();
  const collection = $derived(data.collection);
  const sync = $derived(data.sync);

  async function disconnectSync() {
    const res = await fetch(`/api/collections/${collection.id}/sync`, { method: 'DELETE' });
    if (!res.ok) { toast.danger('Disconnect failed'); return; }
    await invalidateAll();
    toast.success('Sync disconnected');
  }

  let editingName = $state(false);
  // svelte-ignore state_referenced_locally
  let nameDraft = $state(collection.name);
  let nameInput = $state<HTMLInputElement | undefined>(undefined);
  let deleting = $state(false);

  type Person = { id: string; name: string; avatarUrl: string | null; role: string | null };
  type Company = {
    id: string;
    name: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    domain: string | null;
  };

  let pickerPerson = $state<Person[]>([]);
  let pickerCompany = $state<Company | null>(null);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/collections/${collection.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      if (!deleting) toast.danger('Update failed');
      return false;
    }
    if (!deleting) await invalidateAll();
    return true;
  }

  async function commitName() {
    if (!editingName) return;
    const next = nameDraft.trim();
    editingName = false;
    if (!next || next === collection.name) return;
    await patch({ name: next });
  }

  function startEditingName() {
    nameDraft = collection.name;
    editingName = true;
    setTimeout(() => nameInput?.focus(), 0);
  }

  async function toggleArchive() {
    await patch({ isArchived: !collection.isArchived });
  }

  async function del() {
    if (!confirm(`Delete collection "${collection.name}"? Members are not deleted; only the grouping goes away.`)) return;
    deleting = true;
    const res = await fetch(`/api/collections/${collection.id}`, { method: 'DELETE' });
    if (!res.ok) {
      deleting = false;
      toast.danger('Delete failed');
      return;
    }
    toast.success(`Deleted ${collection.name}`);
    goto('/collections');
  }

  async function add(kind: 'person' | 'company', refId: string) {
    const res = await fetch(`/api/collections/${collection.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, refId })
    });
    if (!res.ok) {
      toast.danger('Could not add');
      return;
    }
    await invalidateAll();
  }
  async function remove(kind: 'person' | 'company', refId: string) {
    const res = await fetch(`/api/collections/${collection.id}/items`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, refId })
    });
    if (!res.ok) {
      toast.danger('Could not remove');
      return;
    }
    await invalidateAll();
  }

  async function onAddPerson(p: Person) {
    pickerPerson = [];
    await add('person', p.id);
  }
  async function onPickCompany(c: Company | null) {
    pickerCompany = null;
    if (c) await add('company', c.id);
  }

  /* ── which kind, from the URL ───────────────────────────────────────────── */

  type Kind = 'all' | 'people' | 'companies';

  const kind = $derived.by<Kind>(() => {
    const k = page.url.searchParams.get('kind');
    return k === 'people' || k === 'companies' ? k : 'all';
  });

  /**
   * `just` is a one-shot "Saved …" banner flag. Carrying it through a segment
   * click would re-show the banner every time you switch view inside the grace
   * window, so it is dropped rather than preserved.
   */
  function buildUrl(overrides: Record<string, string | null>): string {
    const params = new URLSearchParams(page.url.searchParams);
    params.delete('just');
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/collections/${collection.id}?${qs}` : `/collections/${collection.id}`;
  }

  const members = $derived(collection.members);
  const peopleCount = $derived(members.filter((m) => m.kind === 'person').length);
  const companyCount = $derived(members.length - peopleCount);

  // Counts come from the unfiltered list, so the control reads as an overview
  // rather than shifting under you as you type in the search box.
  const kindSegments = $derived([
    { value: 'all', label: `All ${members.length}`, icon: Layers, href: buildUrl({ kind: null }) },
    {
      value: 'people',
      label: `People ${peopleCount}`,
      icon: Users,
      href: buildUrl({ kind: 'people' })
    },
    {
      value: 'companies',
      label: `Companies ${companyCount}`,
      icon: Building2,
      href: buildUrl({ kind: 'companies' })
    }
  ]);

  /* ── search and sort, over what is already loaded ───────────────────────── */

  let query = $state('');
  let sort = $state<'added' | 'name'>('added');
  const needle = $derived(query.trim().toLowerCase());

  const byKind = $derived(
    kind === 'people'
      ? members.filter((m) => m.kind === 'person')
      : kind === 'companies'
        ? members.filter((m) => m.kind === 'company')
        : members
  );

  const filtered = $derived(
    !needle
      ? byKind
      : byKind.filter(
          (m) =>
            m.name.toLowerCase().includes(needle) ||
            !!m.role?.toLowerCase().includes(needle) ||
            !!m.companyName?.toLowerCase().includes(needle) ||
            !!m.domain?.toLowerCase().includes(needle) ||
            m.tags.some((t) => t.name.toLowerCase().includes(needle))
        )
  );

  // The server already returns addedAt DESC, so 'added' is the identity.
  const visible = $derived(
    sort === 'name' ? [...filtered].sort((a, b) => a.name.localeCompare(b.name)) : filtered
  );

  /* ── list vs cards, remembered per workspace ────────────────────────────── */

  const VIEWS = ['list', 'cards'] as const;
  type View = (typeof VIEWS)[number];

  /**
   * Initialised to the value the server also renders. Reading localStorage here
   * instead would make the first client render pick a different branch than the
   * SSR'd HTML — a hydration mismatch — so the stored preference is applied in
   * `onMount`, one frame later.
   */
  let view = $state<View>('list');
  const viewKey = $derived(`heli:collections:view:${data.workspaceId}`);

  onMount(() => {
    const stored = readViewPref<View>(viewKey, VIEWS);
    if (stored) view = stored;
  });

  function setView(next: string) {
    view = next as View;
    writeViewPref(viewKey, next);
  }

  let adding = $state(false);

  /**
   * Reserve the card's tag row only when something in this collection is
   * tagged. Uniform cards is the requirement; a blank strip under every card in
   * a collection nobody has tagged is dead space bought for nothing.
   */
  const anyTags = $derived(members.some((m) => m.tags.length > 0));
</script>

{#snippet addButton()}
  <!--
    Adding is a secondary action, so it is one button rather than two
    always-open comboboxes. Those took a full row above the members, were empty
    most of the time, and made the page read as a form with a list underneath it
    rather than a collection you can add to.

    The panel follows the kind filter: on ?kind=people there is no company
    picker, because adding a company from the Companies-filtered view and
    watching it vanish is a confusion worth designing out.
  -->
  <Popover bind:open={adding} label="Add to collection" panelRole="dialog" autoFocus={false}>
    {#snippet trigger(attrs)}
      <Button {...attrs} variant="primary">
        <Plus size={14} strokeWidth={2} />
        Add
      </Button>
    {/snippet}
    {#snippet content()}
      <div class="flex w-72 flex-col gap-3 p-3">
        {#if kind !== 'companies'}
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-medium text-[var(--color-muted)]">Person</span>
            <PersonPicker
              selected={pickerPerson}
              onAdd={onAddPerson}
              onRemove={() => (pickerPerson = [])}
              placeholder="Search people…"
            />
          </div>
        {/if}
        {#if kind !== 'people'}
          <div class="flex flex-col gap-1.5">
            <span class="text-xs font-medium text-[var(--color-muted)]">Company</span>
            <CompanyPicker
              selected={pickerCompany}
              onPick={onPickCompany}
              placeholder="Search companies…"
            />
          </div>
        {/if}
      </div>
    {/snippet}
  </Popover>
{/snippet}

{#snippet memberRow(m: CollectionMemberDetail)}
  <div class="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--color-row-hover)]">
    <a
      href={m.kind === 'person' ? `/people/${m.id}` : `/companies/${m.id}`}
      class="flex min-w-0 flex-1 items-center gap-2"
    >
      {#if m.kind === 'person'}
        <Avatar name={m.name} src={m.avatarUrl} size="md" />
      {:else}
        <CompanyLogo
          domain={m.domain}
          fallbackUrl={m.logoUrl ?? m.faviconUrl}
          name={m.name}
          size={36}
        />
      {/if}
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-[var(--color-text)]">{m.name}</span>
        {#if m.kind === 'person' ? m.role || m.companyName : m.domain}
          <span class="block truncate text-xs text-[var(--color-muted)]">
            {m.kind === 'person'
              ? [m.role, m.companyName].filter(Boolean).join(' · ')
              : m.domain}
          </span>
        {/if}
      </span>
    </a>
    <button
      type="button"
      onclick={() => remove(m.kind, m.id)}
      aria-label="Remove {m.name}"
      class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-bg)] group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
    ><X size={12} strokeWidth={2} /></button>
  </div>
{/snippet}

<svelte:head>
  <title>{collection.name} — {APP_NAME}</title>
</svelte:head>

<article class="flex flex-col gap-6">
  {#if data.justSaved}
    <div class="rounded-[var(--radius-sm)] border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-3 py-2 text-sm text-[var(--color-text)]">
      Saved &ldquo;{collection.name}&rdquo;. Add people and companies below.
    </div>
  {/if}

  <header class="flex items-start gap-4">
    <span class="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
      {#if collection.icon}
        <CollectionIcon name={collection.icon} size={16} strokeWidth={2} />
      {:else}
        <FolderOpen size={16} strokeWidth={2} />
      {/if}
    </span>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        {#if editingName}
          <input
            bind:this={nameInput}
            bind:value={nameDraft}
            onblur={commitName}
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitName(); }
              if (e.key === 'Escape') { editingName = false; nameDraft = collection.name; }
            }}
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-2xl font-semibold tracking-tight"
          />
        {:else}
          <button
            type="button"
            onclick={startEditingName}
            class="rounded-[var(--radius-sm)] px-1 -mx-1 text-2xl font-semibold tracking-tight hover:bg-[var(--color-surface)]"
          >{collection.name}</button>
        {/if}
        {#if collection.isArchived}
          <span class="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">archived</span>
        {/if}
      </div>
      <p class="mt-1 text-sm text-[var(--color-muted)]">
        {members.length} {members.length === 1 ? 'member' : 'members'}
        · {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
        · {companyCount} {companyCount === 1 ? 'company' : 'companies'}
      </p>
    </div>
    <div class="flex items-center gap-1">
      <a
        href={`/pipelines/new?fromCollection=${collection.id}`}
        title="Create pipeline from this collection"
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
      ><Funnel size={16} strokeWidth={2} /></a>
      <button
        type="button"
        title={collection.isArchived ? 'Unarchive' : 'Archive'}
        onclick={toggleArchive}
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
      ><Archive size={16} strokeWidth={2} /></button>
      <button
        type="button"
        title="Delete"
        onclick={del}
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
      ><Trash2 size={16} strokeWidth={2} /></button>
    </div>
  </header>

  {#if sync}
    <div
      class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-md)] border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-3 py-2 text-xs"
    >
      <Funnel size={12} strokeWidth={2} />
      <span class="font-medium text-[var(--color-text)]">Synced with</span>
      <a
        href={`/pipelines/${sync.pipelineId}`}
        class="font-medium underline underline-offset-2 hover:text-[var(--color-text)]"
      >{sync.pipelineName}</a>
      <span class="text-[var(--color-muted)]">
        — members added or removed on either side are mirrored automatically.
      </span>
      <button
        type="button"
        onclick={disconnectSync}
        class="ml-auto text-[var(--color-subtle)] underline underline-offset-2 hover:text-[var(--color-danger)]"
      >Disconnect</button>
    </div>
  {/if}

  <!--
    Tucked under the header rather than given its own full-width row: unlabelled
    and spanning the page, an empty description field reads as a search bar
    sitting above a list that has its own search. Constrained and pulled up
    against the title, it reads as what it is — a line about this collection.
  -->
  <NotesEditor
    class="-mt-3 max-w-3xl"
    value={collection.description}
    placeholder="What is this collection about?"
    onSave={async (next) => { await patch({ description: next }); }}
  />

  <section class="flex flex-col gap-3">
    <!--
      One toolbar row, read left to right as: what am I looking at, then how do
      I narrow it, then how is it drawn, then how do I add to it. The three
      display controls are grouped hard against each other and the Add button is
      pushed off with a divider, so a destructive-free primary action does not
      read as a fourth filter.
    -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <SegmentedControl size="sm" label="Member kind" value={kind} segments={kindSegments} />

      <div class="ml-auto flex flex-wrap items-center gap-2">
        <div class="relative">
          <Search
            size={14}
            strokeWidth={2}
            class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--color-subtle)]"
          />
          <input
            type="search"
            bind:value={query}
            aria-label="Search members"
            placeholder="Search…"
            class="h-8 w-36 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] pr-2 pl-8 text-sm transition-colors focus:border-[var(--color-highlight-border)] sm:w-48"
          />
        </div>

        <Select
          size="sm"
          ghost
          label="Sort members"
          bind:value={sort}
          options={[
            { value: 'added', label: 'Recently added' },
            { value: 'name', label: 'Name (A–Z)' }
          ]}
        >
          {#snippet icon()}
            <ArrowUpDown size={14} strokeWidth={2} />
          {/snippet}
        </Select>

        <SegmentedControl
          size="sm"
          iconOnly
          label="View"
          value={view}
          onchange={setView}
          segments={[
            { value: 'list', label: 'List view', icon: Rows3 },
            { value: 'cards', label: 'Card view', icon: LayoutGrid }
          ]}
        />

        <span class="h-5 w-px bg-[var(--color-border)]" aria-hidden="true"></span>

        {@render addButton()}
      </div>
    </div>

    {#if needle && visible.length !== byKind.length}
      <p class="text-xs text-[var(--color-subtle)]">
        Showing {visible.length} of {byKind.length}
      </p>
    {/if}

    {#if visible.length === 0}
      {#if needle}
        <EmptyState
          compact
          icon={Search}
          title="No matches"
          description={`Nothing here matches “${query.trim()}”.`}
        >
          {#snippet actions()}
            <Button onclick={() => (query = '')}>Clear search</Button>
          {/snippet}
        </EmptyState>
      {:else if kind === 'people'}
        <EmptyState compact icon={Users} title="No people yet" description="Nobody in this collection is a person.">
          {#snippet actions()}
            {#if companyCount > 0}
              <Button href={buildUrl({ kind: null })}>Show all {members.length}</Button>
            {/if}
          {/snippet}
        </EmptyState>
      {:else if kind === 'companies'}
        <EmptyState
          compact
          icon={Building2}
          title="No companies yet"
          description="Nothing in this collection is a company."
        >
          {#snippet actions()}
            {#if peopleCount > 0}
              <Button href={buildUrl({ kind: null })}>Show all {members.length}</Button>
            {/if}
          {/snippet}
        </EmptyState>
      {:else}
        <EmptyState
          icon={FolderOpen}
          title="Nothing here yet"
          description="Add the people and companies this collection is about."
        >
          {#snippet actions()}
            {@render addButton()}
          {/snippet}
        </EmptyState>
      {/if}
    {:else if view === 'cards'}
      <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {#each visible as m (`${m.kind}:${m.id}`)}
          <li>
            <CollectionMemberCard
              member={m}
              reserveTags={anyTags}
              onRemove={() => remove(m.kind, m.id)}
            />
          </li>
        {/each}
      </ul>
    {:else}
      <ul
        class="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]"
      >
        {#each visible as m (`${m.kind}:${m.id}`)}
          <li>{@render memberRow(m)}</li>
        {/each}
      </ul>
    {/if}
  </section>
</article>
