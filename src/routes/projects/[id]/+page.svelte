<script lang="ts">
  import Editable from '$lib/ui/Editable.svelte';
  import IconPicker from '$lib/components/IconPicker.svelte';
  import { APP_NAME } from '$lib/branding';
  import { goto, invalidateAll } from '$app/navigation';
  import { Trash2, AlertTriangle, Plus, X, Briefcase } from 'lucide-svelte';
  import StatusChip from '$lib/components/StatusChip.svelte';
  import LinksEditor from '$lib/components/LinksEditor.svelte';
  import PersonPicker from '$lib/components/PersonPicker.svelte';
  import CompanyPicker from '$lib/components/CompanyPicker.svelte';
  import CompanyLogo from '$lib/components/CompanyLogo.svelte';
  import NotesEditor from '$lib/components/NotesEditor.svelte';
  import AddReminder from '$lib/components/AddReminder.svelte';
  import SaveBanner from '$lib/components/SaveBanner.svelte';
  import { COLLECTION_ICON_MAP } from '$lib/collectionIcons';
  import { TYPE_META, dayBucket, formatTime, type InteractionType } from '$lib/interactions';
  import { toast } from '$lib/toasts.svelte';
  import type { ProjectStatus } from '$lib/server/schema';

  let { data } = $props();
  const project = $derived(data.project);

  // Name editing
  // svelte-ignore state_referenced_locally
  let nameCommitInFlight: Promise<void> | null = $state(null);
  let deleting = $state(false);

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


  async function changeStatus(next: ProjectStatus) {
    await patch({ status: next });
  }

  async function changeIcon(name: string | null) {
    if ((name || null) === (project.icon || null)) return;
    await patch({ icon: name || null });
  }

  async function del() {
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

  function toDateInput(ts: number | null): string {
    if (!ts) return '';
    return new Date(ts).toISOString().slice(0, 10);
  }

  function fmtMoney(cents: number | null, currency: string | null): string {
    if (cents == null) return '—';
    const value = cents / 100;
    if (currency) {
      try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
      catch { /* fall through */ }
    }
    return value.toFixed(2);
  }

  const overdue = $derived(
    project.status === 'active' &&
    typeof project.endDate === 'number' &&
    project.endDate < Date.now()
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

  async function onAddPerson(p: { id: string; name: string; avatarUrl: string | null; role: string | null }) {
    pickerPerson = [];
    await attachPerson(p.id);
  }
  async function onPickCompany(c: typeof pickerCompany) {
    pickerCompany = null;
    if (c) await attachCompany(c.id);
  }

  const ProjectIcon = $derived(project.icon && COLLECTION_ICON_MAP[project.icon] ? COLLECTION_ICON_MAP[project.icon] : null);

  const inputRowClass = 'min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none';
</script>

<svelte:head>
  <title>{project.name} — {APP_NAME}</title>
</svelte:head>

<article class="flex flex-col gap-6">
  {#if data.justSaved}
    <SaveBanner variant="just" kind="project" entityId={project.id} entityName={project.name} createdAt={project.createdAt} />
  {/if}

  <header class="flex items-start gap-3">
    <IconPicker value={project.icon} onChange={changeIcon}>
      {#if ProjectIcon}
        <ProjectIcon size={22} strokeWidth={1.75} />
      {:else}
        <Briefcase size={22} strokeWidth={1.75} />
      {/if}
    </IconPicker>

    <!-- Name + status -->
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <Editable
          value={project.name}
          label="Name"
          onCommit={saveName}
          inputClass="px-2 py-1 text-2xl font-semibold tracking-tight"
          displayClass="text-2xl font-semibold tracking-tight"
        />
        <StatusChip status={project.status as ProjectStatus} size="md" onChange={changeStatus} />
        {#if overdue}
          <span class="inline-flex items-center gap-1 rounded-full border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-danger)]">
            <AlertTriangle size={12} strokeWidth={2} />
            Overdue
          </span>
        {/if}
      </div>
    </div>

    <button
      type="button"
      title="Delete"
      onclick={del}
      class="shrink-0 rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
    >
      <Trash2 size={16} strokeWidth={2} />
    </button>
  </header>

  <div class="grid gap-6 md:grid-cols-[1fr_280px]">
    <!-- Main content -->
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
          <ul class="flex flex-col gap-0.5">
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
          <ul class="flex flex-col gap-0.5">
            {#each project.companies as c (c.id)}
              <li>
                <div class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[var(--color-surface)]">
                  <a href={`/companies/${c.id}`} class="flex min-w-0 flex-1 items-center gap-2">
                    <CompanyLogo
                      domain={c.domain}
                      fallbackUrl={c.logoUrl ?? c.faviconUrl}
                      name={c.name}
                      size={28}
                    />
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
        <CompanyPicker
          selected={pickerCompany}
          onPick={onPickCompany}
          placeholder={project.companies.length > 0 ? 'Add another company…' : 'Add a company…'}
        />
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

    <!-- Sidebar -->
    <aside class="flex flex-col gap-3">
      <!-- Details card: dates + billing, all editable -->
      <div class="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Details</h3>

        <div class="flex flex-col gap-1.5">
          <label class="flex items-center justify-between gap-2">
            <span class="shrink-0 text-xs text-[var(--color-muted)]">Start</span>
            <input
              type="date"
              value={toDateInput(project.startDate)}
              onchange={(e) => patch({ startDate: e.currentTarget.value || null })}
              class={inputRowClass}
            />
          </label>
          <label class="flex items-center justify-between gap-2">
            <span class="shrink-0 text-xs text-[var(--color-muted)]">End</span>
            <input
              type="date"
              value={toDateInput(project.endDate)}
              onchange={(e) => patch({ endDate: e.currentTarget.value || null })}
              class={inputRowClass}
            />
          </label>
        </div>

        <div class="border-t border-[var(--color-border)]"></div>

        <div class="flex flex-col gap-1.5">
          <label class="flex items-center justify-between gap-2">
            <span class="shrink-0 text-xs text-[var(--color-muted)]">Billing</span>
            <select
              value={project.billingType}
              onchange={(e) => patch({ billingType: e.currentTarget.value })}
              class={inputRowClass}
            >
              <option value="none">None</option>
              <option value="hourly">Hourly</option>
              <option value="fixed">Fixed</option>
            </select>
          </label>
          {#if project.billingType === 'hourly'}
            <label class="flex items-center justify-between gap-2">
              <span class="shrink-0 text-xs text-[var(--color-muted)]">Rate</span>
              <div class="flex items-center gap-1">
                <input
                  type="number"
                  inputmode="decimal"
                  step="0.01"
                  min="0"
                  value={(project.hourlyRate ?? 0) / 100}
                  onblur={(e) => {
                    const cents = Math.round(parseFloat(e.currentTarget.value || '0') * 100);
                    if (cents !== (project.hourlyRate ?? 0)) patch({ hourlyRate: cents });
                  }}
                  class="w-20 {inputRowClass}"
                />
                <span class="text-xs text-[var(--color-muted)]">/hr</span>
              </div>
            </label>
            <label class="flex items-center justify-between gap-2">
              <span class="shrink-0 text-xs text-[var(--color-muted)]">Currency</span>
              <input
                type="text"
                maxlength="3"
                value={project.currency ?? ''}
                placeholder="USD"
                onblur={(e) => {
                  const val = e.currentTarget.value.trim().toUpperCase() || null;
                  if (val !== project.currency) patch({ currency: val });
                }}
                class="w-14 uppercase {inputRowClass}"
              />
            </label>
          {:else if project.billingType === 'fixed'}
            <label class="flex items-center justify-between gap-2">
              <span class="shrink-0 text-xs text-[var(--color-muted)]">Fee</span>
              <input
                type="number"
                inputmode="decimal"
                step="0.01"
                min="0"
                value={(project.fixedFee ?? 0) / 100}
                onblur={(e) => {
                  const cents = Math.round(parseFloat(e.currentTarget.value || '0') * 100);
                  if (cents !== (project.fixedFee ?? 0)) patch({ fixedFee: cents });
                }}
                class="w-24 {inputRowClass}"
              />
            </label>
            <label class="flex items-center justify-between gap-2">
              <span class="shrink-0 text-xs text-[var(--color-muted)]">Currency</span>
              <input
                type="text"
                maxlength="3"
                value={project.currency ?? ''}
                placeholder="USD"
                onblur={(e) => {
                  const val = e.currentTarget.value.trim().toUpperCase() || null;
                  if (val !== project.currency) patch({ currency: val });
                }}
                class="w-14 uppercase {inputRowClass}"
              />
            </label>
          {/if}
        </div>
      </div>

      <!-- Reminder -->
      <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Reminder</h3>
        <AddReminder kind="project" refId={project.id} />
      </div>
    </aside>
  </div>
</article>
