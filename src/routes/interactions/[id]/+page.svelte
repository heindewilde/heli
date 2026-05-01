<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { Trash2, Pencil, Save, X, Building2 } from 'lucide-svelte';
  import PersonPicker from '$lib/components/PersonPicker.svelte';
  import CompanyPicker from '$lib/components/CompanyPicker.svelte';
  import {
    INTERACTION_TYPES,
    TYPE_META,
    toLocalDatetimeInput,
    fromLocalDatetimeInput,
    formatTime,
    dayBucket,
    type InteractionType
  } from '$lib/interactions';
  import { toast } from '$lib/toasts.svelte';

  let { data } = $props();
  const interaction = $derived(data.interaction);

  let editing = $state(false);
  let saving = $state(false);

  // edit-mode local state
  let title = $state('');
  let body = $state('');
  let type = $state<InteractionType>('meeting');
  let occurredAt = $state('');
  let people = $state<Array<{ id: string; name: string; avatarUrl: string | null; role: string | null }>>([]);
  let company = $state<{ id: string; name: string; logoUrl: string | null; faviconUrl: string | null; domain: string | null } | null>(null);

  function startEditing() {
    title = interaction.title;
    body = interaction.body ? interaction.body.replace(/<[^>]+>/g, '') : '';
    type = interaction.type as InteractionType;
    occurredAt = toLocalDatetimeInput(interaction.occurredAt);
    people = interaction.people.map((p) => ({ ...p, role: null }));
    company = interaction.companyId
      ? { id: interaction.companyId, name: interaction.companyName ?? '', logoUrl: null, faviconUrl: null, domain: null }
      : null;
    editing = true;
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      const ts = fromLocalDatetimeInput(occurredAt);
      if (!ts) {
        toast.danger('Invalid date');
        return;
      }
      const res = await fetch(`/api/interactions/${interaction.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          body: body || null,
          type,
          occurredAt: ts,
          companyId: company?.id ?? null,
          personIds: people.map((p) => p.id)
        })
      });
      if (!res.ok) {
        toast.danger('Update failed');
        return;
      }
      toast.success('Saved');
      editing = false;
      await invalidateAll();
    } finally {
      saving = false;
    }
  }

  async function del() {
    let cancelled = false;
    const id = interaction.id;
    const undoFn = () => {
      cancelled = true;
    };
    toast.warning(`Deleted ${interaction.title}`, { undo: undoFn, ttl: 5500 });
    goto('/interactions');
    setTimeout(async () => {
      if (cancelled) return;
      const res = await fetch(`/api/interactions/${id}`, { method: 'DELETE' });
      if (!res.ok) toast.danger('Delete failed');
    }, 5500);
  }

  const meta = $derived(TYPE_META[interaction.type as InteractionType] ?? TYPE_META.other);
  const Icon = $derived(meta.icon);
  const dayLabel = $derived(dayBucket(interaction.occurredAt).label);
</script>

<article class="flex flex-col gap-6">
  <header class="flex items-start gap-4">
    <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]">
      <Icon size={18} strokeWidth={2} class={meta.tone} />
    </span>
    <div class="min-w-0 flex-1">
      {#if editing}
        <input
          bind:value={title}
          class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-2xl font-semibold tracking-tight"
        />
      {:else}
        <h1 class="text-2xl font-semibold tracking-tight">{interaction.title}</h1>
      {/if}
      <p class="text-sm text-[var(--color-muted)]">
        {dayLabel} · {formatTime(interaction.occurredAt)} · {meta.label}
      </p>
    </div>
    <div class="flex items-center gap-1">
      {#if editing}
        <button
          type="button"
          onclick={save}
          disabled={saving}
          title="Save"
          class="rounded-[var(--radius-sm)] bg-[var(--color-product)] p-2 text-white"
        ><Save size={16} strokeWidth={2} /></button>
        <button
          type="button"
          onclick={() => (editing = false)}
          title="Cancel"
          class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
        ><X size={16} strokeWidth={2} /></button>
      {:else}
        <button
          type="button"
          onclick={startEditing}
          title="Edit"
          class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
        ><Pencil size={16} strokeWidth={2} /></button>
        <button
          type="button"
          onclick={del}
          title="Delete"
          class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
        ><Trash2 size={16} strokeWidth={2} /></button>
      {/if}
    </div>
  </header>

  <div class="grid gap-6 md:grid-cols-[1fr_280px]">
    <section class="flex flex-col gap-4">
      {#if editing}
        <fieldset class="flex flex-wrap gap-1.5 text-sm">
          {#each INTERACTION_TYPES as t (t)}
            {@const I = TYPE_META[t].icon}
            <button
              type="button"
              onclick={() => (type = t)}
              class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-2.5 py-1 text-sm {type === t
                ? 'border-[var(--color-product-border)] bg-[var(--color-product-bg)] text-[var(--color-product)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'}"
            >
              <I size={12} strokeWidth={2} />
              {TYPE_META[t].label}
            </button>
          {/each}
        </fieldset>
        <input
          type="datetime-local"
          bind:value={occurredAt}
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
        />
        <textarea
          bind:value={body}
          rows="8"
          class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed"
        ></textarea>
      {:else if interaction.body}
        <div class="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)] [&_a]:text-[var(--color-product)]">
          {@html interaction.body}
        </div>
      {:else}
        <p class="text-sm italic text-[var(--color-subtle)]">No body.</p>
      {/if}
    </section>

    <aside class="flex flex-col gap-4 text-sm">
      <div>
        <h2 class="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">People</h2>
        {#if editing}
          <PersonPicker
            selected={people}
            onAdd={(p) => (people = [...people, p])}
            onRemove={(id) => (people = people.filter((p) => p.id !== id))}
          />
        {:else if interaction.people.length === 0}
          <p class="italic text-[var(--color-subtle)]">No people attached.</p>
        {:else}
          <ul class="flex flex-col gap-1">
            {#each interaction.people as p (p.id)}
              <li>
                <a href={`/people/${p.id}`} class="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 hover:bg-[var(--color-surface)]">
                  <span class="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[10px]">
                    {#if p.avatarUrl}
                      <img src={p.avatarUrl} alt="" class="h-full w-full object-cover" />
                    {:else}
                      {(p.name[0] ?? '·').toUpperCase()}
                    {/if}
                  </span>
                  <span>{p.name}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div>
        <h2 class="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Company</h2>
        {#if editing}
          <CompanyPicker selected={company} onPick={(c) => (company = c)} />
        {:else if interaction.companyId && interaction.companyName}
          <a
            href={`/companies/${interaction.companyId}`}
            class="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 hover:border-[var(--color-border-strong)]"
          >
            <Building2 size={14} strokeWidth={2} class="text-[var(--color-muted)]" />
            <span>{interaction.companyName}</span>
          </a>
        {:else}
          <p class="italic text-[var(--color-subtle)]">No company.</p>
        {/if}
      </div>
    </aside>
  </div>
</article>
