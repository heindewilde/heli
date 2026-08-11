<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { goto, invalidateAll, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { Star, Archive, Trash2, Loader2, Mail, Phone, MapPin, Building2, Sparkles, Linkedin, Twitter } from 'lucide-svelte';
  import NotesEditor from '$lib/components/NotesEditor.svelte';
  import FieldRow from '$lib/components/FieldRow.svelte';
  import Editable from '$lib/ui/Editable.svelte';
  import InteractionRow from '$lib/components/InteractionRow.svelte';
  import TagInput from '$lib/components/TagInput.svelte';
  import Skeleton from '$lib/ui/Skeleton.svelte';
  import CollectionsCard from '$lib/components/CollectionsCard.svelte';
  import PipelinesCard from '$lib/components/PipelinesCard.svelte';
  import ProjectsCard from '$lib/components/ProjectsCard.svelte';
  import TasksCard from '$lib/components/TasksCard.svelte';
  import AddReminder from '$lib/components/AddReminder.svelte';
  import SaveBanner from '$lib/components/SaveBanner.svelte';
  import CompanyLogo from '$lib/components/CompanyLogo.svelte';
  import CompanyPicker from '$lib/components/CompanyPicker.svelte';
  import SocialLinks from '$lib/components/SocialLinks.svelte';
  import OutreachDialog from '$lib/components/OutreachDialog.svelte';
  import { Plus, MessageSquarePlus, Send } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import { registerCommands } from '$lib/commands/registry.svelte';
  import { onMount } from 'svelte';
  import { pollWhile } from '$lib/polling';

  let { data } = $props();
  const person = $derived(data.person);

  /**
   * `?outreach=<templateId>` opens the composer straight onto that template.
   * That is how a pipeline card hands off: the composer needs an email, a
   * LinkedIn URL and a company name, none of which the board query carries.
   */
  const outreachParam = $derived(page.url.searchParams.get('outreach'));
  let outreachOpen = $state(false);
  let handedOffTemplate = $state<string | null>(null);

  $effect(() => {
    if (!outreachParam) return;
    handedOffTemplate = outreachParam;
    outreachOpen = true;
    // Drop the parameter so a refresh, or a back-navigation, does not reopen
    // a composer the user has already closed.
    const url = new URL(page.url);
    url.searchParams.delete('outreach');
    replaceState(url, {});
  });

  /** What the renderer needs, flattened out of the person row and its company. */
  const outreachTarget = $derived({
    id: person.id,
    name: person.name,
    role: person.role,
    email: person.email,
    location: person.location,
    phone: person.phone,
    linkedinUrl: person.linkedinUrl,
    xUrl: person.xUrl,
    companyName: data.company?.name ?? null
  });

  // Page-scoped commands. Registering them on mount and unregistering on
  // destroy is what lets the palette offer "Log an interaction with Ada"
  // without every page's actions polluting every other page.
  onMount(() =>
    registerCommands([
      {
        id: 'ctx:log-interaction',
        title: `Log an interaction with ${person.name}`,
        section: 'This page',
        icon: MessageSquarePlus,
        keywords: ['call', 'meeting', 'note', 'email'],
        run: () => goto(`/interactions/new?person=${person.id}`)
      },
      {
        id: 'ctx:outreach',
        title: `Write outreach to ${person.name}`,
        section: 'This page',
        icon: Send,
        keywords: ['template', 'message', 'email', 'dm'],
        run: () => (outreachOpen = true)
      },
      {
        id: 'ctx:favorite',
        title: person.isFavorite ? `Unfavourite ${person.name}` : `Favourite ${person.name}`,
        section: 'This page',
        icon: Star,
        run: () => patch({ isFavorite: !person.isFavorite })
      },
      {
        id: 'ctx:archive',
        title: person.isArchived ? `Unarchive ${person.name}` : `Archive ${person.name}`,
        section: 'This page',
        icon: Archive,
        run: () => patch({ isArchived: !person.isArchived })
      }
    ])
  );
  const company = $derived(data.company);
  // interactions / tags / projects / collections / pipelines / tasks arrive as
  // promises now — the page shell paints before they resolve. See the load
  // function for why.
  const suggestion = $derived(data.suggestion);


  // svelte-ignore state_referenced_locally

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

  // Editable exits edit mode synchronously before awaiting, so a blur during
  // teardown cannot re-enter. The in-flight handle survives because delete
  // still has to settle a rename before it runs — see del().
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
    // Settle any in-flight rename first so we don't race the delete.
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

<svelte:head>
  <title>{person.name} — {APP_NAME}</title>
</svelte:head>

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
        <Editable
          value={person.name}
          label="Name"
          onCommit={saveName}
          inputClass="px-2 py-1 text-2xl font-semibold tracking-tight"
          displayClass="text-2xl font-semibold tracking-tight"
        />
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
      <button
        type="button"
        title="Write outreach"
        onclick={() => (outreachOpen = true)}
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
      >
        <Send size={16} strokeWidth={2} />
      </button>
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

  <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
    <section class="flex min-w-0 flex-col gap-6">
      <div class="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
        <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Notes</h3>
          <NotesEditor
            value={person.notes}
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
          <TasksCard kind="person" refId={person.id} {tasks} />
        {/await}
      </div>

      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Interactions</h3>
          <a
            href={`/interactions/new?person=${person.id}`}
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
              No interactions logged with {person.name} yet.
            </p>
          {:else}
            <ul class="flex flex-col gap-0.5">
              {#each interactions as i (i.id)}
                <li>
                  <InteractionRow
                    {...i}
                    showCompany={false}
                    people={i.people.filter((p) => p.id !== person.id)}
                  />
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
          <CollectionsCard kind="person" refId={person.id} {collections} />
        {/await}
        {#await data.pipelines}
          <div
            class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <Skeleton lines={2} />
          </div>
        {:then pipelines}
          <PipelinesCard kind="person" refId={person.id} {pipelines} />
        {/await}
        {#await data.projects}
          <div
            class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          >
            <Skeleton lines={2} />
          </div>
        {:then projects}
          <ProjectsCard
            kind="person"
            refId={person.id}
            projects={[...projects.together, ...projects.other]}
            sharedIds={new Set(projects.together.map((p) => p.id))}
            sharedLabel={company?.name ?? ''}
          />
        {/await}
      </div>
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
        {#await data.tags}
          <Skeleton lines={1} class="px-1 py-1" />
        {:then tags}
          <TagInput scope="person" entityId={person.id} {tags} suggestions={tagSuggestions} />
        {/await}
      </div>
    </aside>
  </div>
</article>

{#if data.user}
  <OutreachDialog
    open={outreachOpen}
    person={outreachTarget}
    sender={{ name: data.user.username ?? '', email: data.user.email }}
    templateId={handedOffTemplate}
    onclose={() => (outreachOpen = false)}
    onSent={() => invalidateAll()}
  />
{/if}
