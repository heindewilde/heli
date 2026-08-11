<script lang="ts">
  import Editable from '$lib/ui/Editable.svelte';
  import { APP_NAME } from '$lib/branding';
  import { goto, invalidate } from '$app/navigation';
  import { Star, Archive, Trash2, Loader2, MapPin, Building2, Linkedin, Twitter, X } from 'lucide-svelte';
  import PersonPicker from '$lib/components/PersonPicker.svelte';
  import NotesEditor from '$lib/components/NotesEditor.svelte';
  import FieldRow from '$lib/components/FieldRow.svelte';
  import InteractionRow from '$lib/components/InteractionRow.svelte';
  import TagInput from '$lib/components/TagInput.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import AddReminder from '$lib/components/AddReminder.svelte';
  import CompanyOutreachButton from '$lib/components/CompanyOutreachButton.svelte';
  import CollectionsCard from '$lib/components/CollectionsCard.svelte';
  import PipelinesCard from '$lib/components/PipelinesCard.svelte';
  import ProjectsCard from '$lib/components/ProjectsCard.svelte';
  import TasksCard from '$lib/components/TasksCard.svelte';
  import SaveBanner from '$lib/components/SaveBanner.svelte';
  import CompanyLogo from '$lib/components/CompanyLogo.svelte';
  import SocialLinks from '$lib/components/SocialLinks.svelte';
  import { Plus, MessageSquarePlus } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import { registerCommands } from '$lib/commands/registry.svelte';
  import { onMount } from 'svelte';
  import { pollWhile } from '$lib/polling';

  let { data } = $props();
  const company = $derived(data.company);

  onMount(() =>
    registerCommands([
      {
        id: 'ctx:log-interaction',
        title: `Log an interaction with ${company.name}`,
        section: 'This page',
        icon: MessageSquarePlus,
        keywords: ['call', 'meeting', 'note', 'email'],
        run: () => goto(`/interactions/new?company=${company.id}`)
      },
      {
        id: 'ctx:favorite',
        title: company.isFavorite ? `Unfavourite ${company.name}` : `Favourite ${company.name}`,
        section: 'This page',
        icon: Star,
        run: () => patch({ isFavorite: !company.isFavorite })
      },
      {
        id: 'ctx:archive',
        title: company.isArchived ? `Unarchive ${company.name}` : `Archive ${company.name}`,
        section: 'This page',
        icon: Archive,
        run: () => patch({ isArchived: !company.isArchived })
      }
    ])
  );
  const linkedPeople = $derived(data.linkedPeople);
  // interactions / tags / projects / collections / pipelines / tasks are
  // promises — the shell paints before they resolve.

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
      () => invalidate('heli:company')
    );
  });

  // svelte-ignore state_referenced_locally
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
    if (!deleting) await invalidate('heli:company');
  }


  let pickerPeople = $state<{ id: string; name: string; avatarUrl: string | null; role: string | null; companyId?: string | null }[]>([]);

  async function patchPerson(personId: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/people/${personId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) { toast.danger('Could not update person'); return; }
    await invalidate('heli:company');
  }

  async function linkPerson(p: { id: string; name: string; companyId?: string | null }) {
    if (p.companyId && p.companyId !== company.id) {
      if (!confirm(`${p.name} is already linked to a different company. Replace that link?`)) return;
    }
    await patchPerson(p.id, { companyId: company.id });
    pickerPeople = [];
  }

  async function unlinkPerson(p: { id: string; name: string }) {
    await patchPerson(p.id, { companyId: null });
  }

  // Editable exits edit mode synchronously before awaiting, so a blur during
  // teardown cannot re-enter. The in-flight handle stays because delete still
  // has to settle a rename before it runs.
  async function saveName(next: string | null): Promise<boolean> {
    const name = next?.trim();
    if (!name) return false; // empty name is a rejection, not a clear
    nameCommitInFlight = (async () => {
      try {
        await patch({ name });
      } finally {
        nameCommitInFlight = null;
      }
    })();
    await nameCommitInFlight;
    return true;
  }


  async function del() {
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

<svelte:head>
  <title>{company.name} — {APP_NAME}</title>
</svelte:head>

<article class="flex flex-col gap-6">
  {#if data.justSaved}
    <SaveBanner variant="just" kind="company" entityId={company.id} entityName={company.name} createdAt={company.createdAt} />
  {:else if data.dedup}
    <SaveBanner variant="dedup" kind="company" entityId={company.id} entityName={company.name} createdAt={company.createdAt} />
  {/if}
  <header class="flex items-start gap-4">
    <CompanyLogo
      domain={company.domain}
      fallbackUrl={company.logoUrl ?? company.faviconUrl}
      name={company.name}
      size={56}
      rounded="md"
      class="text-base"
    />
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <Editable
          value={company.name}
          label="Name"
          onCommit={saveName}
          inputClass="px-2 py-1 text-2xl font-semibold tracking-tight"
          displayClass="text-2xl font-semibold tracking-tight"
        />
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
      <div class="mt-2">
        <SocialLinks
          url={company.url}
          linkedinUrl={company.linkedinUrl}
          xUrl={company.xUrl}
          primaryFallback="website"
        />
      </div>
    </div>
    <div class="flex items-center gap-1">
      {#if data.user}
        <CompanyOutreachButton
          companyName={company.name}
          people={data.linkedPeople}
          sender={{ name: data.user.username ?? '', email: data.user.email }}
          onSent={() => invalidate('heli:company')}
        />
      {/if}
      <AddReminder iconOnly kind="company" refId={company.id} />
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

  <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
    <section class="flex min-w-0 flex-col gap-6">
      <div class="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
        <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <h3 class="text-sm font-semibold text-[var(--color-text)]">Notes</h3>
          <NotesEditor
            value={company.notes}
            onSave={(next) => patch({ notes: next })}
          />
        </div>
        {#await data.tasks}
          <div
            class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <Skeleton lines={3} />
          </div>
        {:then tasks}
          <TasksCard kind="company" refId={company.id} {tasks} />
        {/await}
      </div>

      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-[var(--color-text)]">Interactions</h3>
          <a
            href={`/interactions/new?company=${company.id}`}
            class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-0.5 text-xs hover:bg-[var(--color-bg)]"
          >
            <Plus size={12} strokeWidth={2} />
            Log
          </a>
        </div>
        {#await data.interactions}
          <Skeleton lines={4} class="px-1 py-2" />
        {:then interactions}
          {#if interactions.length === 0}
            <p class="px-1 py-2 text-xs text-[var(--color-muted)]">
              No interactions logged with {company.name} yet.
            </p>
          {:else}
            <ul class="flex flex-col gap-0.5">
              {#each interactions as i (i.id)}
                <li>
                  <InteractionRow {...i} showCompany={false} />
                </li>
              {/each}
            </ul>
          {/if}
        {/await}
      </div>

      <div class="grid gap-6 md:grid-cols-3 [&>*]:min-w-0">
        {#await data.collections}
          <div
            class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <Skeleton lines={2} />
          </div>
        {:then collections}
          <CollectionsCard kind="company" refId={company.id} {collections} />
        {/await}
        {#await data.pipelines}
          <div
            class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <Skeleton lines={2} />
          </div>
        {:then pipelines}
          <PipelinesCard kind="company" refId={company.id} {pipelines} />
        {/await}
        {#await data.projects}
          <div
            class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <Skeleton lines={2} />
          </div>
        {:then projects}
          <ProjectsCard kind="company" refId={company.id} {projects} />
        {/await}
      </div>
    </section>

    <aside class="flex flex-col gap-3">
      <div class="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm">
        <FieldRow label="Industry" icon={Building2} value={company.industry} field="industry" id={company.id} endpoint="companies" />
        <FieldRow label="Location" icon={MapPin} value={company.location} field="location" id={company.id} endpoint="companies" />
        <FieldRow label="LinkedIn" icon={Linkedin} value={company.linkedinUrl} field="linkedinUrl" id={company.id} endpoint="companies" />
        <FieldRow label="X" icon={Twitter} value={company.xUrl} field="xUrl" id={company.id} endpoint="companies" />
      </div>
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-sm font-semibold text-[var(--color-text)]">Tags</h3>
        {#await data.tags}
          <Skeleton lines={1} class="px-1 py-1" />
        {:then tags}
          <TagInput scope="company" entityId={company.id} {tags} suggestions={tagSuggestions} />
        {/await}
      </div>
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div class="flex items-center gap-1.5">
          <h3 class="text-sm font-semibold text-[var(--color-text)]">People</h3>
          {#if linkedPeople.length > 0}
            <span class="rounded-full bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">{linkedPeople.length}</span>
          {/if}
        </div>
        {#if linkedPeople.length > 0}
          <ul class="flex flex-col">
            {#each linkedPeople as p (p.id)}
              <li>
                <div class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 hover:bg-[var(--color-bg)]">
                  <a href={`/people/${p.id}`} class="flex min-w-0 flex-1 items-center gap-2">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] text-[10px] text-[var(--color-muted)]">
                      {#if p.avatarUrl}
                        <img src={p.avatarUrl} alt="" class="h-full w-full object-cover" />
                      {:else}
                        {(p.name[0] ?? '·').toUpperCase()}
                      {/if}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-xs font-medium">{p.name}</span>
                      {#if p.role}
                        <span class="block truncate text-[10px] text-[var(--color-muted)]">{p.role}</span>
                      {/if}
                    </span>
                  </a>
                  <button
                    type="button"
                    onclick={() => unlinkPerson(p)}
                    aria-label="Unlink {p.name}"
                    class="rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] group-hover:opacity-100"
                  ><X size={11} strokeWidth={2} /></button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
        <PersonPicker
          selected={pickerPeople}
          onAdd={(p) => linkPerson(p)}
          onRemove={() => {}}
          placeholder={linkedPeople.length > 0 ? 'Add another…' : 'Add a person…'}
        />
      </div>
    </aside>
  </div>
</article>
