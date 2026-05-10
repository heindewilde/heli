<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { Star, Archive, Trash2, ExternalLink, Loader2, MapPin, Building2 } from 'lucide-svelte';
  import NotesEditor from '$lib/components/NotesEditor.svelte';
  import FieldRow from '$lib/components/FieldRow.svelte';
  import InteractionRow from '$lib/components/InteractionRow.svelte';
  import TagInput from '$lib/components/TagInput.svelte';
  import AddReminder from '$lib/components/AddReminder.svelte';
  import CollectionsRibbon from '$lib/components/CollectionsRibbon.svelte';
  import PipelinesRibbon from '$lib/components/PipelinesRibbon.svelte';
  import SaveBanner from '$lib/components/SaveBanner.svelte';
  import StatusChip from '$lib/components/StatusChip.svelte';
  import { FolderKanban } from 'lucide-svelte';
  import type { ProjectStatus } from '$lib/server/schema';
  import { Plus } from 'lucide-svelte';
  import { dayBucket } from '$lib/interactions';
  import { toast } from '$lib/toasts.svelte';
  import { onMount } from 'svelte';
  import { pollWhile } from '$lib/polling';

  let { data } = $props();
  const company = $derived(data.company);
  const linkedPeople = $derived(data.linkedPeople);
  const interactions = $derived(data.interactions);
  const tags = $derived(data.tags);

  let tagSuggestions = $state<{ id: string; name: string; slug: string; count: number }[]>([]);

  onMount(() => {
    fetch('/api/tags?scope=company')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => (tagSuggestions = d.items ?? []))
      .catch(() => {});
  });

  $effect(() => {
    return pollWhile(
      () => company.source === 'parsing',
      () => invalidateAll()
    );
  });

  const interactionGroups = $derived.by(() => {
    const today = new Date();
    const map = new Map<string, { label: string; items: typeof interactions }>();
    for (const item of interactions) {
      const b = dayBucket(item.occurredAt, today);
      const g = map.get(b.key);
      if (g) g.items.push(item);
      else map.set(b.key, { label: b.label, items: [item] });
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  });

  let editingName = $state(false);
  // svelte-ignore state_referenced_locally
  let nameDraft = $state(company.name);
  let nameInput = $state<HTMLInputElement | undefined>(undefined);
  let nameCommitInFlight: Promise<void> | null = $state(null);
  let deleting = $state(false);

  async function patch(patch: Record<string, unknown>) {
    if (nameCommitInFlight) await nameCommitInFlight;
    const res = await fetch(`/api/companies/${company.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) {
      if (!deleting) toast.danger('Update failed');
      return;
    }
    if (!deleting) await invalidateAll();
  }

  async function commitName() {
    if (!editingName) return;
    const next = nameDraft.trim();
    editingName = false;
    if (!next || next === company.name) return;
    nameCommitInFlight = (async () => {
      try {
        await patch({ name: next });
      } finally {
        nameCommitInFlight = null;
      }
    })();
    await nameCommitInFlight;
  }

  function startEditingName() {
    nameDraft = company.name;
    editingName = true;
    setTimeout(() => nameInput?.focus(), 0);
  }

  async function del() {
    if (editingName) await commitName();
    if (nameCommitInFlight) await nameCommitInFlight;
    if (!confirm(`Delete ${company.name}? Linked people will keep their records but lose the link.`)) return;
    deleting = true;
    const res = await fetch(`/api/companies/${company.id}`, { method: 'DELETE' });
    if (!res.ok) {
      deleting = false;
      toast.danger('Delete failed');
      return;
    }
    toast.success(`Deleted ${company.name}`);
    goto('/companies');
  }

  const initials = $derived(
    company.name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase()
  );
</script>

<article class="flex flex-col gap-6">
  {#if data.justSaved}
    <SaveBanner variant="just" kind="company" entityId={company.id} entityName={company.name} createdAt={company.createdAt} />
  {:else if data.dedup}
    <SaveBanner variant="dedup" kind="company" entityId={company.id} entityName={company.name} createdAt={company.createdAt} />
  {/if}
  <header class="flex items-start gap-4">
    <span class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-base font-medium text-[var(--color-muted)]">
      {#if company.logoUrl || company.faviconUrl}
        <img src={company.logoUrl ?? company.faviconUrl ?? ''} alt="" class="h-full w-full object-cover" />
      {:else}
        {initials || '·'}
      {/if}
    </span>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        {#if editingName}
          <input
            bind:this={nameInput}
            bind:value={nameDraft}
            onblur={commitName}
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitName(); }
              if (e.key === 'Escape') { editingName = false; nameDraft = company.name; }
            }}
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-2xl font-semibold tracking-tight"
          />
        {:else}
          <button
            type="button"
            onclick={startEditingName}
            class="rounded-[var(--radius-sm)] px-1 -mx-1 text-2xl font-semibold tracking-tight hover:bg-[var(--color-surface)]"
          >{company.name}</button>
        {/if}
        {#if company.source === 'parsing'}
          <span class="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
            <Loader2 size={12} strokeWidth={2} class="animate-spin" />
            Enriching…
          </span>
        {/if}
      </div>
      {#if company.industry || company.location}
        <p class="text-sm text-[var(--color-muted)]">
          {company.industry ?? ''}{company.industry && company.location ? ' · ' : ''}{company.location ?? ''}
        </p>
      {/if}
      {#if company.url}
        <a
          href={company.url}
          target="_blank"
          rel="nofollow noopener noreferrer"
          class="mt-1 inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:underline"
        >
          <ExternalLink size={12} strokeWidth={2} />
          {company.domain ?? company.url}
        </a>
      {/if}
    </div>
    <div class="flex items-center gap-1">
      <button
        type="button"
        title={company.isFavorite ? 'Unfavorite' : 'Favorite'}
        onclick={() => patch({ isFavorite: !company.isFavorite })}
        class="rounded-[var(--radius-sm)] p-2 hover:bg-[var(--color-surface)] {company.isFavorite ? 'text-[var(--color-warning)]' : 'text-[var(--color-subtle)]'}"
      >
        <Star size={16} strokeWidth={2} fill={company.isFavorite ? 'currentColor' : 'none'} />
      </button>
      <button
        type="button"
        title={company.isArchived ? 'Unarchive' : 'Archive'}
        onclick={() => patch({ isArchived: !company.isArchived })}
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
      >
        <Archive size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        title="Delete"
        onclick={del}
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
      >
        <Trash2 size={16} strokeWidth={2} />
      </button>
    </div>
  </header>

  {#if company.description}
    <p class="text-sm leading-relaxed text-[var(--color-muted)]">{company.description}</p>
  {/if}

  <div class="grid gap-6 md:grid-cols-[1fr_260px]">
    <section class="flex flex-col gap-3">
      <h2 class="text-sm font-medium text-[var(--color-muted)]">Notes</h2>
      <NotesEditor
        value={company.notes}
        onSave={(next) => patch({ notes: next })}
      />

      {#if linkedPeople.length > 0}
        <h2 class="mt-4 text-sm font-medium text-[var(--color-muted)]">People at this company</h2>
        <ul class="flex flex-col gap-1">
          {#each linkedPeople as p (p.id)}
            <li>
              <a
                href={`/people/${p.id}`}
                class="flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[var(--color-surface)]"
              >
                <span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-muted)]">
                  {#if p.avatarUrl}
                    <img src={p.avatarUrl} alt="" class="h-full w-full object-cover" />
                  {:else}
                    {(p.name[0] ?? '·').toUpperCase()}
                  {/if}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{p.name}</span>
                  {#if p.role}
                    <span class="block truncate text-xs text-[var(--color-muted)]">{p.role}</span>
                  {/if}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="mt-4 flex items-center justify-between">
        <h2 class="text-sm font-medium text-[var(--color-muted)]">Interactions</h2>
        <a
          href={`/interactions/new?company=${company.id}`}
          class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-bg)]"
        >
          <Plus size={12} strokeWidth={2} />
          Log interaction
        </a>
      </div>
      {#if interactions.length === 0}
        <p class="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center text-xs text-[var(--color-muted)]">
          No interactions logged with {company.name} yet.
        </p>
      {:else}
        <div class="flex flex-col gap-4">
          {#each interactionGroups as [key, g] (key)}
            <section class="flex flex-col gap-1">
              <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">{g.label}</h3>
              <ul class="flex flex-col gap-0.5">
                {#each g.items as i (i.id)}
                  <li>
                    <InteractionRow {...i} showCompany={false} />
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
        </div>
      {/if}

      {#if data.projects.length > 0}
        <div class="flex flex-col gap-2 mt-4">
          <h2 class="text-sm font-medium text-[var(--color-muted)]">Projects</h2>
          <ul class="flex flex-col gap-1">
            {#each data.projects as p (p.id)}
              <li>
                <a
                  href={`/projects/${p.id}`}
                  class="group flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 hover:border-[var(--color-product-border)]"
                >
                  <FolderKanban size={14} strokeWidth={2} class="shrink-0 text-[var(--color-muted)]" />
                  <span class="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <StatusChip status={p.status as ProjectStatus} size="sm" />
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>

    <aside class="flex flex-col gap-3">
      <div class="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm">
        <FieldRow label="Industry" icon={Building2} value={company.industry} field="industry" id={company.id} endpoint="companies" />
        <FieldRow label="Location" icon={MapPin} value={company.location} field="location" id={company.id} endpoint="companies" />
      </div>
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Tags</h3>
        <TagInput scope="company" entityId={company.id} {tags} suggestions={tagSuggestions} />
      </div>
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Collections</h3>
        <CollectionsRibbon kind="company" refId={company.id} collections={data.collections} />
      </div>
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Pipelines</h3>
        <PipelinesRibbon kind="company" refId={company.id} pipelines={data.pipelines} />
      </div>
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Reminder</h3>
        <AddReminder kind="company" refId={company.id} />
      </div>
    </aside>
  </div>
</article>
