<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { Star, Archive, Trash2, ExternalLink, Loader2, Mail, Phone, MapPin, Building2 } from 'lucide-svelte';
  import NotesEditor from '$lib/components/NotesEditor.svelte';
  import FieldRow from '$lib/components/FieldRow.svelte';
  import { toast } from '$lib/toasts.svelte';

  let { data } = $props();
  const person = $derived(data.person);
  const company = $derived(data.company);

  let editingName = $state(false);
  // svelte-ignore state_referenced_locally
  let nameDraft = $state(person.name);
  let nameInput = $state<HTMLInputElement | undefined>(undefined);

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

  <div class="grid gap-6 md:grid-cols-[1fr_260px]">
    <section class="flex flex-col gap-3">
      <h2 class="text-sm font-medium text-[var(--color-muted)]">Notes</h2>
      <NotesEditor
        value={person.notes}
        onSave={(next) => patch({ notes: next })}
      />
    </section>

    <aside class="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm">
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
    </aside>
  </div>
</article>
