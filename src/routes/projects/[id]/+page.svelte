<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import {
    Trash2,
    AlertTriangle,
    Calendar,
    DollarSign,
    Building2,
    Users,
    ExternalLink,
    Plus,
    Pencil,
    Check,
    X
  } from 'lucide-svelte';
  import StatusChip from '$lib/components/StatusChip.svelte';
  import LinksEditor from '$lib/components/LinksEditor.svelte';
  import PersonPicker from '$lib/components/PersonPicker.svelte';
  import CompanyPicker from '$lib/components/CompanyPicker.svelte';
  import NotesEditor from '$lib/components/NotesEditor.svelte';
  import TagInput from '$lib/components/TagInput.svelte';
  import AddReminder from '$lib/components/AddReminder.svelte';
  import SaveBanner from '$lib/components/SaveBanner.svelte';
  import { TYPE_META, dayBucket, formatTime, type InteractionType } from '$lib/interactions';
  import { toast } from '$lib/toasts.svelte';
  import type { ProjectStatus } from '$lib/server/schema';

  let { data } = $props();
  const project = $derived(data.project);

  let editingName = $state(false);
  // svelte-ignore state_referenced_locally
  let nameDraft = $state(project.name);
  let nameInput = $state<HTMLInputElement | undefined>(undefined);
  let nameCommitInFlight: Promise<void> | null = $state(null);
  let deleting = $state(false);

  let editingNextStep = $state(false);
  // svelte-ignore state_referenced_locally
  let nextStepDraft = $state(project.nextStep ?? '');

  let tagSuggestions = $state<{ id: string; name: string; slug: string; count: number }[]>([]);

  onMount(() => {
    fetch('/api/tags?scope=project')
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => (tagSuggestions = d.items ?? []))
      .catch(() => {});
  });

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    if (nameCommitInFlight) await nameCommitInFlight;
    const res = await fetch(`/api/projects/${project.id}`, {
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
    if (!next || next === project.name) return;
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
    nameDraft = project.name;
    editingName = true;
    setTimeout(() => nameInput?.focus(), 0);
  }

  async function commitNextStep() {
    const next = nextStepDraft.trim();
    editingNextStep = false;
    if ((next || null) === (project.nextStep || null)) return;
    await patch({ nextStep: next || null });
  }

  async function changeStatus(next: ProjectStatus) {
    await patch({ status: next });
  }

  async function del() {
    if (editingName) await commitName();
    if (nameCommitInFlight) await nameCommitInFlight;
    if (!confirm(`Delete project "${project.name}"? Member links and interactions stay; the project itself is removed.`)) return;
    deleting = true;
    const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
    if (!res.ok) {
      deleting = false;
      toast.danger('Delete failed');
      return;
    }
    toast.success(`Deleted ${project.name}`);
    goto('/projects');
  }

  async function attachPerson(personId: string) {
    const res = await fetch(`/api/projects/${project.id}/people`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personId })
    });
    if (!res.ok) toast.danger('Could not attach person');
    else await invalidateAll();
  }
  async function detachPerson(personId: string) {
    const res = await fetch(`/api/projects/${project.id}/people`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personId })
    });
    if (!res.ok) toast.danger('Could not remove person');
    else await invalidateAll();
  }
  async function attachCompany(companyId: string) {
    const res = await fetch(`/api/projects/${project.id}/companies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyId })
    });
    if (!res.ok) toast.danger('Could not attach company');
    else await invalidateAll();
  }
  async function detachCompany(companyId: string) {
    const res = await fetch(`/api/projects/${project.id}/companies`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyId })
    });
    if (!res.ok) toast.danger('Could not remove company');
    else await invalidateAll();
  }

  function fmtDate(ts: number | null): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function fmtMoney(cents: number | null, currency: string | null): string {
    if (cents == null) return '—';
    const value = cents / 100;
    if (currency) {
      try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
      } catch {
        // fall through
      }
    }
    return value.toFixed(2);
  }

  const overdue = $derived(
    project.status === 'active' && typeof project.endDate === 'number' && project.endDate < Date.now()
  );

  const interactionGroups = $derived.by(() => {
    const today = new Date();
    const map = new Map<string, { label: string; items: typeof project.interactions }>();
    for (const item of project.interactions) {
      const b = dayBucket(item.occurredAt, today);
      const g = map.get(b.key);
      if (g) g.items.push(item);
      else map.set(b.key, { label: b.label, items: [item] });
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  });

  let pickerPerson = $state<{ id: string; name: string; avatarUrl: string | null; role: string | null }[]>([]);
  let pickerCompany = $state<{ id: string; name: string; logoUrl: string | null; faviconUrl: string | null; domain: string | null } | null>(null);

  // When the picker emits a selection, immediately attach + clear so the
  // user can chain adds without re-clicking.
  async function onAddPerson(p: { id: string; name: string; avatarUrl: string | null; role: string | null }) {
    pickerPerson = [];
    await attachPerson(p.id);
  }
  async function onPickCompany(c: typeof pickerCompany) {
    pickerCompany = null;
    if (c) await attachCompany(c.id);
  }
</script>

<article class="flex flex-col gap-6">
  {#if data.justSaved}
    <SaveBanner variant="just" kind="project" entityId={project.id} entityName={project.name} createdAt={project.createdAt} />
  {/if}

  <header class="flex items-start gap-4">
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        {#if editingName}
          <input
            bind:this={nameInput}
            bind:value={nameDraft}
            onblur={commitName}
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitName(); }
              if (e.key === 'Escape') { editingName = false; nameDraft = project.name; }
            }}
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-2xl font-semibold tracking-tight"
          />
        {:else}
          <button
            type="button"
            onclick={startEditingName}
            class="rounded-[var(--radius-sm)] px-1 -mx-1 text-2xl font-semibold tracking-tight hover:bg-[var(--color-surface)]"
          >{project.name}</button>
        {/if}
        <StatusChip status={project.status as ProjectStatus} size="md" onChange={changeStatus} />
        {#if overdue}
          <span class="inline-flex items-center gap-1 rounded-full border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-danger)]">
            <AlertTriangle size={12} strokeWidth={2} />
            Overdue
          </span>
        {/if}
      </div>
      <p class="mt-1 flex flex-wrap items-center gap-3 text-sm text-[var(--color-muted)]">
        {#if project.startDate || project.endDate}
          <span class="inline-flex items-center gap-1">
            <Calendar size={12} strokeWidth={2} />
            {fmtDate(project.startDate)} → {fmtDate(project.endDate)}
          </span>
        {/if}
        {#if project.billingType !== 'none'}
          <span class="inline-flex items-center gap-1">
            <DollarSign size={12} strokeWidth={2} />
            {#if project.billingType === 'hourly'}
              {fmtMoney(project.hourlyRate, project.currency)}/hr
            {:else}
              {fmtMoney(project.fixedFee, project.currency)} fixed
            {/if}
          </span>
        {/if}
      </p>
    </div>
    <div class="flex items-center gap-1">
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

  <div class="grid gap-6 md:grid-cols-[1fr_280px]">
    <section class="flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-[var(--color-muted)]">Description</h2>
        <NotesEditor
          value={project.description}
          placeholder="What is this project about?"
          onSave={async (next) => { await patch({ description: next }); }}
        />
      </div>

      <div class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-[var(--color-muted)]">Links</h2>
        <LinksEditor projectId={project.id} links={project.links} />
      </div>

      <div class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-[var(--color-muted)]">People</h2>
        {#if project.people.length > 0}
          <ul class="flex flex-col gap-1">
            {#each project.people as p (p.id)}
              <li>
                <div class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[var(--color-surface)]">
                  <a href={`/people/${p.id}`} class="flex min-w-0 flex-1 items-center gap-2">
                    <span class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-muted)]">
                      {#if p.avatarUrl}
                        <img src={p.avatarUrl} alt="" class="h-full w-full object-cover" />
                      {:else}
                        {(p.name[0] ?? '·').toUpperCase()}
                      {/if}
                    </span>
                    <span class="truncate text-sm">{p.name}</span>
                  </a>
                  <button
                    type="button"
                    onclick={() => detachPerson(p.id)}
                    aria-label="Remove {p.name}"
                    class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-bg)] group-hover:opacity-100"
                  ><X size={12} strokeWidth={2} /></button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
        <PersonPicker
          selected={pickerPerson}
          onAdd={onAddPerson}
          onRemove={() => (pickerPerson = [])}
          placeholder={project.people.length > 0 ? 'Add another person…' : 'Add a person…'}
        />
      </div>

      <div class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-[var(--color-muted)]">Companies</h2>
        {#if project.companies.length > 0}
          <ul class="flex flex-col gap-1">
            {#each project.companies as c (c.id)}
              <li>
                <div class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[var(--color-surface)]">
                  <a href={`/companies/${c.id}`} class="flex min-w-0 flex-1 items-center gap-2">
                    <span class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-muted)]">
                      {#if c.logoUrl || c.faviconUrl}
                        <img src={c.logoUrl ?? c.faviconUrl ?? ''} alt="" class="h-full w-full object-cover" />
                      {:else}
                        <Building2 size={12} strokeWidth={2} />
                      {/if}
                    </span>
                    <span class="truncate text-sm">{c.name}</span>
                  </a>
                  <button
                    type="button"
                    onclick={() => detachCompany(c.id)}
                    aria-label="Remove {c.name}"
                    class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-bg)] group-hover:opacity-100"
                  ><X size={12} strokeWidth={2} /></button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
        <CompanyPicker selected={pickerCompany} onPick={onPickCompany} placeholder={project.companies.length > 0 ? 'Add another company…' : 'Add a company…'} />
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-medium text-[var(--color-muted)]">Interactions</h2>
          <a
            href={`/interactions/new?project=${project.id}`}
            class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-surface)]"
          >
            <Plus size={12} strokeWidth={2} />
            Log interaction
          </a>
        </div>
        {#if project.interactions.length === 0}
          <p class="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center text-xs text-[var(--color-muted)]">
            No interactions logged for {project.name} yet.
          </p>
        {:else}
          <div class="flex flex-col gap-3">
            {#each interactionGroups as [key, g] (key)}
              <section class="flex flex-col gap-1">
                <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">{g.label}</h3>
                <ul class="flex flex-col gap-0.5">
                  {#each g.items as i (i.id)}
                    {@const meta = TYPE_META[i.type as InteractionType] ?? TYPE_META.other}
                    {@const Icon = meta.icon}
                    <li>
                      <a
                        href={`/interactions/${i.id}`}
                        class="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-[var(--color-surface)]"
                      >
                        <Icon size={12} strokeWidth={2} class={meta.tone} />
                        <span class="text-xs text-[var(--color-muted)]">{formatTime(i.occurredAt)}</span>
                        <span class="truncate">{i.title}</span>
                      </a>
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
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Next step</h3>
        {#if editingNextStep}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            bind:value={nextStepDraft}
            autofocus
            onblur={commitNextStep}
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitNextStep(); }
              if (e.key === 'Escape') { editingNextStep = false; nextStepDraft = project.nextStep ?? ''; }
            }}
            placeholder="One line, e.g. 'Send deck Friday'"
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
          />
        {:else}
          <button
            type="button"
            onclick={() => { nextStepDraft = project.nextStep ?? ''; editingNextStep = true; }}
            class="text-left text-sm hover:underline"
          >
            {#if project.nextStep}{project.nextStep}{:else}<span class="italic text-[var(--color-subtle)]">Click to set the next step</span>{/if}
          </button>
        {/if}
      </div>

      {#if project.billingType !== 'none'}
        <div class="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
          <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Billing</h3>
          <div class="flex items-center justify-between">
            <span class="text-[var(--color-muted)]">Type</span>
            <span class="font-medium">{project.billingType}</span>
          </div>
          {#if project.billingType === 'hourly'}
            <div class="flex items-center justify-between">
              <span class="text-[var(--color-muted)]">Rate</span>
              <span class="font-medium">{fmtMoney(project.hourlyRate, project.currency)}/hr</span>
            </div>
          {:else if project.billingType === 'fixed'}
            <div class="flex items-center justify-between">
              <span class="text-[var(--color-muted)]">Fee</span>
              <span class="font-medium">{fmtMoney(project.fixedFee, project.currency)}</span>
            </div>
          {/if}
          <p class="mt-1 text-[10px] text-[var(--color-subtle)]">Recorded for reference; Gusto doesn't track time or invoices.</p>
        </div>
      {/if}

      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Tags</h3>
        <TagInput scope="project" entityId={project.id} tags={project.tags} suggestions={tagSuggestions} />
      </div>

      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Reminder</h3>
        <AddReminder kind="project" refId={project.id} />
      </div>
    </aside>
  </div>
</article>
