<script lang="ts">
  import { goto } from '$app/navigation';
  import PersonPicker from '$lib/components/PersonPicker.svelte';
  import CompanyPicker from '$lib/components/CompanyPicker.svelte';
  import { INTERACTION_TYPES, type InteractionType } from '$lib/server/saveInteraction';
  import { TYPE_META, toLocalDatetimeInput, fromLocalDatetimeInput } from '$lib/interactions';
  import { toast } from '$lib/toasts.svelte';

  let { data } = $props();

  type Person = { id: string; name: string; avatarUrl: string | null; role: string | null };
  type Company = { id: string; name: string; logoUrl: string | null; faviconUrl: string | null; domain: string | null };

  // svelte-ignore state_referenced_locally
  let selectedPeople = $state<Person[]>(data.presetPerson ? [data.presetPerson] : []);
  // svelte-ignore state_referenced_locally
  let selectedCompany = $state<Company | null>(data.presetCompany ?? null);
  let type = $state<InteractionType>('meeting');
  let title = $state('');
  let body = $state('');
  let occurredAt = $state(toLocalDatetimeInput(Date.now()));
  let saving = $state(false);
  let error = $state<string | null>(null);

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
          personIds: selectedPeople.map((p) => p.id)
        })
      });
      if (!res.ok) {
        error = (await res.text()) || 'Could not save.';
        return;
      }
      const result = (await res.json()) as { id: string };
      toast.success('Interaction logged');
      if (saveAnother) {
        title = '';
        body = '';
        occurredAt = toLocalDatetimeInput(Date.now());
      } else {
        goto(`/interactions/${result.id}`);
      }
    } finally {
      saving = false;
    }
  }
</script>

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
              ? 'border-[var(--color-product-border)] bg-[var(--color-product-bg)] text-[var(--color-product)]'
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
        class="rounded-[var(--radius-sm)] bg-[var(--color-product)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
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
