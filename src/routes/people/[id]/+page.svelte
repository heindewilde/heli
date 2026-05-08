<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { Star, Archive, Trash2, ExternalLink, Loader2, Mail, Phone, MapPin, Building2, Sparkles } from 'lucide-svelte';
  import NotesEditor from '$lib/components/NotesEditor.svelte';
  import FieldRow from '$lib/components/FieldRow.svelte';
  import InteractionRow from '$lib/components/InteractionRow.svelte';
  import TagInput from '$lib/components/TagInput.svelte';
  import AddReminder from '$lib/components/AddReminder.svelte';
  import SaveBanner from '$lib/components/SaveBanner.svelte';
  import { Plus } from 'lucide-svelte';
  import { dayBucket } from '$lib/interactions';
  import { toast } from '$lib/toasts.svelte';
  import { onMount } from 'svelte';

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

  let tagSuggestions = $state<{ id: string; name: string; slug: string; count: number }[]>([]);

  onMount(() => {
    fetch('/api/tags?scope=person')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => (tagSuggestions = d.items ?? []))
      .catch(() => {});
  });

  async function patch(patch: Record<string, unknown>) {
    const res = await fetch(`/api/people/${person.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) {
      toast.danger('Update failed');
      return;
    }
    await invalidateAll();
  }

  async function commitName() {
    const next = nameDraft.trim();
    if (!next || next === person.name) {
      editingName = false;
      return;
    }
    await patch({ name: next });
    editingName = false;
  }

  function startEditingName() {
    nameDraft = person.name;
    editingName = true;
    setTimeout(() => nameInput?.focus(), 0);
  }

  async function del() {
    if (!confirm(`Delete ${person.name}?`)) return;
    const res = await fetch(`/api/people/${person.id}`, { method: 'DELETE' });
    if (!res.ok) {
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
        <p class="text-sm text-[var(--color-muted)]">
          {person.role ?? ''}{person.role && company ? ' · ' : ''}{#if company}<a class="hover:underline" href={`/companies/${company.id}`}>{company.name}</a>{/if}
        </p>
      {/if}
      {#if person.url}
        <a
          href={person.url}
          target="_blank"
          rel="nofollow noopener noreferrer"
          class="mt-1 inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:underline"
        >
          <ExternalLink size={12} strokeWidth={2} />
          {person.domain ?? person.url}
        </a>
      {/if}
    </div>
    <div class="flex items-center gap-1">
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
    <aside class="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-product-border)] bg-[var(--color-product-bg)] px-3 py-2 text-sm text-[var(--color-product)]">
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
          class="rounded-[var(--radius-sm)] bg-[var(--color-product)] px-2 py-1 text-xs font-medium text-white"
        >{suggestion.matchId ? 'Link company' : 'Add company'}</button>
        <button
          type="button"
          onclick={dismissSuggestion}
          class="rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--color-product)] hover:bg-[var(--color-product-border)]"
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
    </section>

    <aside class="flex flex-col gap-3">
      <div class="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm">
        <FieldRow label="Email" icon={Mail} value={person.email} field="email" id={person.id} endpoint="people" />
        <FieldRow label="Phone" icon={Phone} value={person.phone} field="phone" id={person.id} endpoint="people" />
        <FieldRow label="Location" icon={MapPin} value={person.location} field="location" id={person.id} endpoint="people" />
        <FieldRow label="Role" icon={Building2} value={person.role} field="role" id={person.id} endpoint="people" />
        {#if company}
          <div class="mt-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <p class="text-xs text-[var(--color-muted)]">Linked company</p>
            <a href={`/companies/${company.id}`} class="mt-1 block text-sm font-medium hover:underline">{company.name}</a>
          </div>
        {/if}
      </div>
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Tags</h3>
        <TagInput scope="person" entityId={person.id} {tags} suggestions={tagSuggestions} />
      </div>
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Reminder</h3>
        <AddReminder kind="person" refId={person.id} />
      </div>
    </aside>
  </div>
</article>
