<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { readErrorCode } from '$lib/api-error';
  import { goto } from '$app/navigation';
  import PersonPicker from '$lib/components/PersonPicker.svelte';
  import CompanyPicker from '$lib/components/CompanyPicker.svelte';
  import ProjectPicker from '$lib/components/ProjectPicker.svelte';
  import {
    INTERACTION_TYPES,
    TYPE_META,
    toLocalDatetimeInput,
    fromLocalDatetimeInput,
    type InteractionType
  } from '$lib/interactions';
  import { toast } from '$lib/toasts.svelte';
  import type { ProjectStatus } from '$lib/server/schema';

  let { data } = $props();

  type Person = { id: string; name: string; avatarUrl: string | null; role: string | null };
  type Company = { id: string; name: string; logoUrl: string | null; faviconUrl: string | null; domain: string | null };
  type Project = { id: string; name: string; status: ProjectStatus };

  // svelte-ignore state_referenced_locally
  let selectedPeople = $state<Person[]>(data.presetPerson ? [data.presetPerson] : []);
  // svelte-ignore state_referenced_locally
  let selectedCompany = $state<Company | null>(data.presetCompany ?? null);
  // svelte-ignore state_referenced_locally
  let selectedProjects = $state<Project[]>(
    data.presetProject ? [{ ...data.presetProject, status: data.presetProject.status as ProjectStatus }] : []
  );
  // IDs we got from the auto-suggest endpoint and the user hasn't explicitly
  // confirmed yet. Visually distinguished in the picker until they save.
  let suggestedIds = $state<Set<string>>(new Set());
  // Confirmed IDs that should NOT be re-suggested (user already removed
  // them once, or explicitly added them — both should stick).
  let dismissedSuggestionIds = $state<Set<string>>(new Set());
  let type = $state<InteractionType>('meeting');
  let title = $state('');
  let body = $state('');
  let occurredAt = $state(toLocalDatetimeInput(Date.now()));
  let saving = $state(false);
  const INTERACTION_ERRORS: Record<string, string> = {
    invalid_type: 'Pick a valid interaction type.',
    missing_title: 'Give this interaction a title.',
    invalid_json: 'Something went wrong sending the request.',
    unauthorized: 'Please sign in again.'
  };

  let error = $state<string | null>(null);

  // Auto-suggest projects whenever the people / company selection changes.
  // Debounced 250ms to avoid thrashing the API on each pick.
  let suggestTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const personIds = selectedPeople.map((p) => p.id);
    const companyId = selectedCompany?.id;
    if (personIds.length === 0 && !companyId) {
      // Nothing to suggest against — clear suggestions but leave manual picks.
      suggestedIds = new Set();
      return;
    }
    if (suggestTimer) clearTimeout(suggestTimer);
    suggestTimer = setTimeout(async () => {
      const params = new URLSearchParams();
      if (personIds.length > 0) params.set('personIds', personIds.join(','));
      if (companyId) params.set('companyId', companyId);
      const exclude = [
        ...selectedProjects.map((p) => p.id),
        ...dismissedSuggestionIds
      ];
      if (exclude.length > 0) params.set('exclude', exclude.join(','));
      try {
        const res = await fetch(`/api/projects/suggest?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as { items: Project[] };
        // Add new suggestions; preserve existing manual picks.
        const newIds = new Set(suggestedIds);
        for (const p of data.items) {
          if (selectedProjects.some((sp) => sp.id === p.id)) continue;
          if (dismissedSuggestionIds.has(p.id)) continue;
          selectedProjects = [...selectedProjects, p];
          newIds.add(p.id);
        }
        suggestedIds = newIds;
      } catch {
        // ignore network errors
      }
    }, 250);
  });

  function addProject(p: Project) {
    if (selectedProjects.some((sp) => sp.id === p.id)) return;
    selectedProjects = [...selectedProjects, p];
    // Manual additions are not suggestions and should not be re-suggested.
    dismissedSuggestionIds = new Set([...dismissedSuggestionIds, p.id]);
  }
  function removeProject(id: string) {
    selectedProjects = selectedProjects.filter((p) => p.id !== id);
    const next = new Set(suggestedIds);
    next.delete(id);
    suggestedIds = next;
    // User explicitly removed it — don't re-suggest the same project on the
    // next selection change.
    dismissedSuggestionIds = new Set([...dismissedSuggestionIds, id]);
  }

  async function submit(saveAnother: boolean) {
    if (saving) return;
    saving = true;
    error = null;
    try {
      const ts = fromLocalDatetimeInput(occurredAt);
      if (!ts) {
        error = 'Invalid date.';
        return;
      }
      if (!title.trim()) {
        error = 'Title is required.';
        return;
      }
      const res = await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          occurredAt: ts,
          type,
          title: title.trim(),
          body: body || null,
          companyId: selectedCompany?.id ?? null,
          personIds: selectedPeople.map((p) => p.id),
          projectIds: selectedProjects.map((p) => p.id)
        })
      });
      if (!res.ok) {
        error = INTERACTION_ERRORS[await readErrorCode(res)] ?? 'Could not save.';
        return;
      }
      const result = (await res.json()) as { id: string };
      toast.success('Interaction logged');
      if (saveAnother) {
        title = '';
        body = '';
        occurredAt = toLocalDatetimeInput(Date.now());
        selectedProjects = [];
        suggestedIds = new Set();
        dismissedSuggestionIds = new Set();
      } else {
        goto(`/interactions/${result.id}`);
      }
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>New interaction — {APP_NAME}</title>
</svelte:head>

<article class="mx-auto flex max-w-2xl flex-col gap-4">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">Log interaction</h1>
    <p class="text-sm text-[var(--color-muted)]">
      Capture a call, meeting, email, or note. Attach the people and company involved.
    </p>
  </header>

  <div class="flex flex-col gap-3">
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">When</span>
      <input
        type="datetime-local"
        bind:value={occurredAt}
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
      />
    </label>

    <fieldset class="flex flex-col gap-1 text-sm">
      <legend class="text-[var(--color-muted)]">Type</legend>
      <div class="flex flex-wrap gap-1.5">
        {#each INTERACTION_TYPES as t (t)}
          {@const I = TYPE_META[t].icon}
          <button
            type="button"
            onclick={() => (type = t)}
            class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1 text-sm {type === t
              ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}"
          >
            <I size={12} strokeWidth={2} />
            {TYPE_META[t].label}
          </button>
        {/each}
      </div>
    </fieldset>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Title *</span>
      <input
        bind:value={title}
        required
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
      />
    </label>

    <div class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">People</span>
      <PersonPicker
        selected={selectedPeople}
        onAdd={(p) => (selectedPeople = [...selectedPeople, p])}
        onRemove={(id) => (selectedPeople = selectedPeople.filter((p) => p.id !== id))}
      />
    </div>

    <div class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Company</span>
      <CompanyPicker selected={selectedCompany} onPick={(c) => (selectedCompany = c)} />
    </div>

    <div class="flex flex-col gap-1 text-sm">
      <span class="flex items-center gap-1 text-[var(--color-muted)]">
        Projects
        {#if suggestedIds.size > 0}
          <span class="text-[10px] text-[var(--color-subtle)]">— suggestions auto-fill from selected people / company</span>
        {/if}
      </span>
      <ProjectPicker
        selected={selectedProjects}
        suggestedIds={suggestedIds}
        onAdd={addProject}
        onRemove={removeProject}
      />
    </div>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Body</span>
      <textarea
        bind:value={body}
        rows="6"
        placeholder="What happened, key points, next steps…"
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 leading-relaxed"
      ></textarea>
    </label>

    {#if error}
      <p class="rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
        {error}
      </p>
    {/if}

    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={() => submit(false)}
        disabled={saving}
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60"
      >{saving ? 'Saving…' : 'Save'}</button>
      <button
        type="button"
        onclick={() => submit(true)}
        disabled={saving}
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm"
      >Save & log another</button>
      <a href="/interactions" class="ml-auto text-sm text-[var(--color-muted)] hover:underline">Cancel</a>
    </div>
  </div>
</article>
