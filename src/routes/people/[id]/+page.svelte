<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { Star, Archive, Trash2, Loader2, Mail, Phone, MapPin, Building2, Sparkles, Linkedin, Twitter } from 'lucide-svelte';
  import NotesEditor from '$lib/components/NotesEditor.svelte';
  import FieldRow from '$lib/components/FieldRow.svelte';
  import InteractionRow from '$lib/components/InteractionRow.svelte';
  import TagInput from '$lib/components/TagInput.svelte';
  import CollectionsRibbon from '$lib/components/CollectionsRibbon.svelte';
  import PipelinesRibbon from '$lib/components/PipelinesRibbon.svelte';
  import AddReminder from '$lib/components/AddReminder.svelte';
  import SaveBanner from '$lib/components/SaveBanner.svelte';
  import StatusChip from '$lib/components/StatusChip.svelte';
  import CompanyLogo from '$lib/components/CompanyLogo.svelte';
  import CompanyPicker from '$lib/components/CompanyPicker.svelte';
  import SocialLinks from '$lib/components/SocialLinks.svelte';
  import { FolderKanban } from 'lucide-svelte';
  import type { ProjectStatus } from '$lib/server/schema';
  import { Plus } from 'lucide-svelte';
  import { dayBucket } from '$lib/interactions';
  import { toast } from '$lib/toasts.svelte';
  import { onMount } from 'svelte';
  import { pollWhile } from '$lib/polling';

  let { data } = $props();
  const person = $derived(data.person);
  const company = $derived(data.company);
  const interactions = $derived(data.interactions);
  const tags = $derived(data.tags);
  const suggestion = $derived(data.suggestion);

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
  let nameDraft = $state(person.name);
  let nameInput = $state<HTMLInputElement | undefined>(undefined);
  // Tracks an in-flight commitName so action buttons (delete/favorite/archive)
  // can serialize against it. Without this, clicking Delete during a name edit
  // races: blur commits the rename, click runs delete; the rename then 404s
  // and toasts a confusing "Update failed".
  let nameCommitInFlight: Promise<void> | null = $state(null);
  let deleting = $state(false);

  let tagSuggestions = $state<{ id: string; name: string; slug: string; count: number }[]>([]);

  onMount(() => {
    fetch('/api/tags?scope=person')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => (tagSuggestions = d.items ?? []))
      .catch(() => {});
  });

  // Surface enrichment results without a manual refresh. Polls every 1.5s
  // while the row is in 'parsing' state, capped at 30s. The cleanup runs both
  // when the effect re-evaluates (source changed) and on unmount.
  $effect(() => {
    return pollWhile(
      () => person.source === 'parsing',
      () => invalidateAll()
    );
  });

  async function patch(patch: Record<string, unknown>) {
    if (nameCommitInFlight) await nameCommitInFlight;
    const res = await fetch(`/api/people/${person.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) {
      // 404 here means a concurrent delete already won — don't add a
      // confusing "Update failed" on top of the user's intended action.
      if (!deleting) toast.danger('Update failed');
      return;
    }
    if (!deleting) await invalidateAll();
  }

  async function commitName() {
    // Exit edit mode synchronously so onblur firing during shutdown can't
    // re-enter this function while the PATCH is in flight.
    if (!editingName) return;
    const next = nameDraft.trim();
    editingName = false;
    if (!next || next === person.name) return;
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
    nameDraft = person.name;
    editingName = true;
    setTimeout(() => nameInput?.focus(), 0);
  }

  async function del() {
    // Settle any in-flight rename first so we don't race the delete.
    if (editingName) await commitName();
    if (nameCommitInFlight) await nameCommitInFlight;
    if (!confirm(`Delete ${person.name}?`)) return;
    deleting = true;
    const res = await fetch(`/api/people/${person.id}`, { method: 'DELETE' });
    if (!res.ok) {
      deleting = false;
      toast.danger('Delete failed');
      return;
    }
    toast.success(`Deleted ${person.name}`);
    goto('/people');
  }

  async function linkSuggestedCompany() {
    if (!suggestion) return;
    if (suggestion.matchId) {
      await patch({ companyId: suggestion.matchId });
      return;
    }
    if (!suggestion.url) {
      toast.warning('No URL for the suggested company; add manually.');
      return;
    }
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: suggestion.url })
    });
    if (!res.ok) {
      toast.danger('Could not save company');
      return;
    }
    const out = (await res.json()) as { id: string; kind: 'person' | 'company' };
    if (out.kind !== 'company') {
      toast.warning('That URL was classified as a person, not a company.');
      return;
    }
    await patch({ companyId: out.id });
    toast.success(`Linked ${suggestion.name}`);
  }

  async function dismissSuggestion() {
    // Clearing the suggested fields removes the banner without linking a company.
    const res = await fetch(`/api/people/${person.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ suggestedCompanyName: null, suggestedCompanyUrl: null })
    });
    if (!res.ok) {
      toast.danger('Could not dismiss');
      return;
    }
    await invalidateAll();
  }

  const initials = $derived(
    person.name
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
    <SaveBanner variant="just" kind="person" entityId={person.id} entityName={person.name} createdAt={person.createdAt} />
  {:else if data.dedup}
    <SaveBanner variant="dedup" kind="person" entityId={person.id} entityName={person.name} createdAt={person.createdAt} />
  {/if}
  <header class="flex items-start gap-4">
    <span class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-base font-medium text-[var(--color-muted)]">
      {#if person.avatarUrl}
        <img src={person.avatarUrl} alt="" class="h-full w-full object-cover" />
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
              if (e.key === 'Escape') { editingName = false; nameDraft = person.name; }
            }}
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-2xl font-semibold tracking-tight"
          />
        {:else}
          <button
            type="button"
            onclick={startEditingName}
            class="rounded-[var(--radius-sm)] px-1 -mx-1 text-2xl font-semibold tracking-tight hover:bg-[var(--color-surface)]"
          >{person.name}</button>
        {/if}
        {#if person.source === 'parsing'}
          <span class="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
            <Loader2 size={12} strokeWidth={2} class="animate-spin" />
            Enriching…
          </span>
        {/if}
      </div>
      {#if person.role || company}
        <p class="flex flex-wrap items-center gap-1.5 text-sm text-[var(--color-muted)]">
          {#if person.role}<span>{person.role}</span>{/if}
          {#if person.role && company}<span class="text-[var(--color-subtle)]">·</span>{/if}
          {#if company}
            <a
              class="inline-flex items-center gap-1.5 hover:underline"
              href={`/companies/${company.id}`}
            >
              <CompanyLogo
                domain={company.domain}
                fallbackUrl={company.logoUrl ?? company.faviconUrl}
                name={company.name}
                size={16}
              />
              <span>{company.name}</span>
            </a>
          {/if}
        </p>
      {/if}
      <div class="mt-2">
        <SocialLinks
          url={person.url}
          linkedinUrl={person.linkedinUrl}
          xUrl={person.xUrl}
          primaryFallback="linkedin"
        />
      </div>
    </div>
    <div class="flex items-center gap-1">
      <AddReminder iconOnly kind="person" refId={person.id} />
      <button
        type="button"
        title={person.isFavorite ? 'Unfavorite' : 'Favorite'}
        onclick={() => patch({ isFavorite: !person.isFavorite })}
        class="rounded-[var(--radius-sm)] p-2 hover:bg-[var(--color-surface)] {person.isFavorite ? 'text-[var(--color-warning)]' : 'text-[var(--color-subtle)]'}"
      >
        <Star size={16} strokeWidth={2} fill={person.isFavorite ? 'currentColor' : 'none'} />
      </button>
      <button
        type="button"
        title={person.isArchived ? 'Unarchive' : 'Archive'}
        onclick={() => patch({ isArchived: !person.isArchived })}
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

  {#if suggestion}
    <aside class="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-3 py-2 text-sm text-[var(--color-text)]">
      <Sparkles size={14} strokeWidth={2} class="mt-0.5 shrink-0" />
      <div class="min-w-0 flex-1">
        <p>
          Looks like {person.name} works at <strong>{suggestion.name}</strong>.
          {#if suggestion.matchId}
            We have a matching company on file.
          {:else if suggestion.url}
            Save it as a company and link it?
          {:else}
            Add it as a company?
          {/if}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onclick={linkSuggestedCompany}
          class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-2 py-1 text-xs font-medium text-[var(--color-accent-fg)]"
        >{suggestion.matchId ? 'Link company' : 'Add company'}</button>
        <button
          type="button"
          onclick={dismissSuggestion}
          class="rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-highlight-border)]"
        >Dismiss</button>
      </div>
    </aside>
  {/if}

  <div class="grid gap-6 md:grid-cols-[1fr_260px]">
    <section class="flex flex-col gap-6">
      <div class="flex flex-col gap-3">
        <h2 class="text-sm font-medium text-[var(--color-muted)]">Notes</h2>
        <NotesEditor
          value={person.notes}
          onSave={(next) => patch({ notes: next })}
        />
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-medium text-[var(--color-muted)]">Interactions</h2>
          <a
            href={`/interactions/new?person=${person.id}`}
            class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-surface)]"
          >
            <Plus size={12} strokeWidth={2} />
            Log interaction
          </a>
        </div>
        {#if interactions.length === 0}
          <p class="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center text-xs text-[var(--color-muted)]">
            No interactions logged with {person.name} yet.
          </p>
        {:else}
          <div class="flex flex-col gap-4">
            {#each interactionGroups as [key, g] (key)}
              <section class="flex flex-col gap-1">
                <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">{g.label}</h3>
                <ul class="flex flex-col gap-0.5">
                  {#each g.items as i (i.id)}
                    <li>
                      <InteractionRow {...i} />
                    </li>
                  {/each}
                </ul>
              </section>
            {/each}
          </div>
        {/if}
      </div>

      {#if data.projectsTogether.length > 0 || data.projectsOther.length > 0}
        <div class="flex flex-col gap-2">
          {#if company && data.projectsTogether.length > 0}
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-medium text-[var(--color-muted)]">Together at {company.name}</h2>
              <span class="rounded-full bg-[var(--color-highlight-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-text)]">{data.projectsTogether.length}</span>
            </div>
            <ul class="flex flex-col gap-1">
              {#each data.projectsTogether as p (p.id)}
                <li>
                  <a
                    href={`/projects/${p.id}`}
                    class="group flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 hover:border-[var(--color-highlight-border)]"
                  >
                    <FolderKanban size={14} strokeWidth={2} class="shrink-0 text-[var(--color-muted)]" />
                    <span class="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    <StatusChip status={p.status as ProjectStatus} size="sm" />
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
          {#if data.projectsOther.length > 0}
            <h2 class="mt-1 text-sm font-medium text-[var(--color-muted)]">{data.projectsTogether.length > 0 ? 'Other projects' : 'Projects'}</h2>
            <ul class="flex flex-col gap-1">
              {#each data.projectsOther as p (p.id)}
                <li>
                  <a
                    href={`/projects/${p.id}`}
                    class="group flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 hover:border-[var(--color-border-strong)]"
                  >
                    <FolderKanban size={14} strokeWidth={2} class="shrink-0 text-[var(--color-muted)]" />
                    <span class="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    <StatusChip status={p.status as ProjectStatus} size="sm" />
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </section>

    <aside class="flex flex-col gap-3">
      <div class="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm">
        <FieldRow label="Email" icon={Mail} value={person.email} field="email" id={person.id} endpoint="people" />
        <FieldRow label="Phone" icon={Phone} value={person.phone} field="phone" id={person.id} endpoint="people" />
        <FieldRow label="Location" icon={MapPin} value={person.location} field="location" id={person.id} endpoint="people" />
        <FieldRow label="Role" icon={Building2} value={person.role} field="role" id={person.id} endpoint="people" />
        <FieldRow label="LinkedIn" icon={Linkedin} value={person.linkedinUrl} field="linkedinUrl" id={person.id} endpoint="people" />
        <FieldRow label="X" icon={Twitter} value={person.xUrl} field="xUrl" id={person.id} endpoint="people" />
        <div class="mt-2">
          <p class="mb-1 text-xs text-[var(--color-muted)]">Company</p>
          <CompanyPicker
            selected={company ?? null}
            onPick={async (c) => {
              if (c) {
                await patch({ companyId: c.id, suggestedCompanyName: null, suggestedCompanyUrl: null });
              } else {
                await patch({ companyId: null });
              }
            }}
            placeholder="Link a company…"
          />
        </div>
      </div>
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Tags</h3>
        <TagInput scope="person" entityId={person.id} {tags} suggestions={tagSuggestions} />
      </div>
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Collections</h3>
        <CollectionsRibbon kind="person" refId={person.id} collections={data.collections} />
      </div>
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Pipelines</h3>
        <PipelinesRibbon kind="person" refId={person.id} pipelines={data.pipelines} />
      </div>
    </aside>
  </div>
</article>
