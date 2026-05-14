<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { Trash2, Archive, X, FolderOpen, GitBranch } from 'lucide-svelte';
  import { COLLECTION_ICON_MAP } from '$lib/collectionIcons';
  import CompanyLogo from '$lib/components/CompanyLogo.svelte';
  import PersonPicker from '$lib/components/PersonPicker.svelte';
  import CompanyPicker from '$lib/components/CompanyPicker.svelte';
  import NotesEditor from '$lib/components/NotesEditor.svelte';
  import { toast } from '$lib/toasts.svelte';

  let { data } = $props();
  const collection = $derived(data.collection);
  const sync = $derived(data.sync);

  async function disconnectSync() {
    const res = await fetch(`/api/collections/${collection.id}/sync`, { method: 'DELETE' });
    if (!res.ok) { toast.danger('Disconnect failed'); return; }
    await invalidateAll();
    toast.success('Sync disconnected');
  }

  let editingName = $state(false);
  // svelte-ignore state_referenced_locally
  let nameDraft = $state(collection.name);
  let nameInput = $state<HTMLInputElement | undefined>(undefined);
  let deleting = $state(false);

  type Person = { id: string; name: string; avatarUrl: string | null; role: string | null };
  type Company = {
    id: string;
    name: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    domain: string | null;
  };

  let pickerPerson = $state<Person[]>([]);
  let pickerCompany = $state<Company | null>(null);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/collections/${collection.id}`, {
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
    if (!next || next === collection.name) return;
    await patch({ name: next });
  }

  function startEditingName() {
    nameDraft = collection.name;
    editingName = true;
    setTimeout(() => nameInput?.focus(), 0);
  }

  async function toggleArchive() {
    await patch({ isArchived: !collection.isArchived });
  }

  async function del() {
    if (!confirm(`Delete collection "${collection.name}"? Members are not deleted; only the grouping goes away.`)) return;
    deleting = true;
    const res = await fetch(`/api/collections/${collection.id}`, { method: 'DELETE' });
    if (!res.ok) {
      deleting = false;
      toast.danger('Delete failed');
      return;
    }
    toast.success(`Deleted ${collection.name}`);
    goto('/collections');
  }

  async function add(kind: 'person' | 'company', refId: string) {
    const res = await fetch(`/api/collections/${collection.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, refId })
    });
    if (!res.ok) {
      toast.danger('Could not add');
      return;
    }
    await invalidateAll();
  }
  async function remove(kind: 'person' | 'company', refId: string) {
    const res = await fetch(`/api/collections/${collection.id}/items`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, refId })
    });
    if (!res.ok) {
      toast.danger('Could not remove');
      return;
    }
    await invalidateAll();
  }

  async function onAddPerson(p: Person) {
    pickerPerson = [];
    await add('person', p.id);
  }
  async function onPickCompany(c: Company | null) {
    pickerCompany = null;
    if (c) await add('company', c.id);
  }

  const peopleMembers = $derived(collection.members.filter((m) => m.kind === 'person'));
  const companyMembers = $derived(collection.members.filter((m) => m.kind === 'company'));
</script>

<article class="flex flex-col gap-6">
  {#if data.justSaved}
    <div class="rounded-[var(--radius-sm)] border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] px-3 py-2 text-sm text-[var(--color-text)]">
      Saved &ldquo;{collection.name}&rdquo;. Add people and companies below.
    </div>
  {/if}

  <header class="flex items-start gap-4">
    <span class="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
      {#if collection.icon && COLLECTION_ICON_MAP[collection.icon]}
        {@const Ic = COLLECTION_ICON_MAP[collection.icon]}
        <Ic size={16} strokeWidth={2} />
      {:else}
        <FolderOpen size={16} strokeWidth={2} />
      {/if}
    </span>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        {#if editingName}
          <input
            bind:this={nameInput}
            bind:value={nameDraft}
            onblur={commitName}
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitName(); }
              if (e.key === 'Escape') { editingName = false; nameDraft = collection.name; }
            }}
            class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-2xl font-semibold tracking-tight"
          />
        {:else}
          <button
            type="button"
            onclick={startEditingName}
            class="rounded-[var(--radius-sm)] px-1 -mx-1 text-2xl font-semibold tracking-tight hover:bg-[var(--color-surface)]"
          >{collection.name}</button>
        {/if}
        {#if collection.isArchived}
          <span class="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs text-[var(--color-muted)]">archived</span>
        {/if}
      </div>
      <p class="mt-1 text-sm text-[var(--color-muted)]">
        {collection.members.length} {collection.members.length === 1 ? 'member' : 'members'}
        · {peopleMembers.length} {peopleMembers.length === 1 ? 'person' : 'people'}
        · {companyMembers.length} {companyMembers.length === 1 ? 'company' : 'companies'}
      </p>
    </div>
    <div class="flex items-center gap-1">
      <a
        href={`/pipelines/new?fromCollection=${collection.id}`}
        title="Create pipeline from this collection"
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
      ><GitBranch size={16} strokeWidth={2} /></a>
      <button
        type="button"
        title={collection.isArchived ? 'Unarchive' : 'Archive'}
        onclick={toggleArchive}
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
      ><Archive size={16} strokeWidth={2} /></button>
      <button
        type="button"
        title="Delete"
        onclick={del}
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
      ><Trash2 size={16} strokeWidth={2} /></button>
    </div>
  </header>

  <div class="grid gap-6 md:grid-cols-[1fr_280px]">
    <section class="flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-[var(--color-muted)]">Description</h2>
        <NotesEditor
          value={collection.description}
          placeholder="What is this collection about?"
          onSave={async (next) => { await patch({ description: next }); }}
        />
      </div>

      <div class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-[var(--color-muted)]">People ({peopleMembers.length})</h2>
        {#if peopleMembers.length > 0}
          <ul class="flex flex-col gap-1">
            {#each peopleMembers as p (p.id)}
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
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm">{p.name}</span>
                      {#if p.role}
                        <span class="block truncate text-xs text-[var(--color-muted)]">{p.role}</span>
                      {/if}
                    </span>
                  </a>
                  <button
                    type="button"
                    onclick={() => remove('person', p.id)}
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
          placeholder={peopleMembers.length > 0 ? 'Add another person…' : 'Add a person…'}
        />
      </div>

      <div class="flex flex-col gap-2">
        <h2 class="text-sm font-medium text-[var(--color-muted)]">Companies ({companyMembers.length})</h2>
        {#if companyMembers.length > 0}
          <ul class="flex flex-col gap-1">
            {#each companyMembers as c (c.id)}
              <li>
                <div class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[var(--color-surface)]">
                  <a href={`/companies/${c.id}`} class="flex min-w-0 flex-1 items-center gap-2">
                    <CompanyLogo
                      domain={c.domain}
                      fallbackUrl={c.logoUrl ?? c.faviconUrl}
                      name={c.name}
                      size={28}
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm">{c.name}</span>
                      {#if c.domain}
                        <span class="block truncate text-xs text-[var(--color-muted)]">{c.domain}</span>
                      {/if}
                    </span>
                  </a>
                  <button
                    type="button"
                    onclick={() => remove('company', c.id)}
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
          placeholder={companyMembers.length > 0 ? 'Add another company…' : 'Add a company…'}
        />
      </div>
    </section>

    <aside class="flex flex-col gap-3">
      {#if sync}
        <div class="rounded-[var(--radius-md)] border border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] p-3 text-xs">
          <div class="flex items-center gap-1.5 font-medium text-[var(--color-text)]">
            <GitBranch size={12} strokeWidth={2} />
            Synced with pipeline
          </div>
          <p class="mt-1 text-[var(--color-muted)]">
            <a href={`/pipelines/${sync.pipelineId}`} class="underline underline-offset-2 hover:text-[var(--color-text)]">{sync.pipelineName}</a>
            — members added or removed on either side are mirrored automatically.
          </p>
          <button
            type="button"
            onclick={disconnectSync}
            class="mt-2 text-[var(--color-subtle)] underline underline-offset-2 hover:text-[var(--color-danger)]"
          >Disconnect sync</button>
        </div>
      {:else}
        <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-muted)]">
          <p>Collections are a lightweight grouping concept. They don't replace tags, projects, or pipelines — they're just an ad-hoc way to keep related people and companies side-by-side.</p>
        </div>
      {/if}
    </aside>
  </div>
</article>
