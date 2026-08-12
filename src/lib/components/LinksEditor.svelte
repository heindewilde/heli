<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { readErrorCode } from '$lib/api-error';
  import { Plus, Trash2, ExternalLink, Pencil, Check, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import {
    LINK_KINDS,
    LINK_KIND_LABELS,
    guessLinkKind,
    linkKindOf,
    type LinkKind
  } from '$lib/projectTypes';

  type Link = { id: string; url: string; label: string | null; kind: string | null };

  type Props = {
    projectId: string;
    links: Link[];
  };

  let { projectId, links }: Props = $props();

  let adding = $state(false);
  let newUrl = $state('');
  let newLabel = $state('');
  let newKind = $state<LinkKind>('other');
  /**
   * Once the user picks a kind by hand, stop re-guessing from the URL. Without
   * this, typing the URL after choosing "Design" would silently reset it.
   */
  let kindTouched = $state(false);
  let saving = $state(false);
  let editingId = $state<string | null>(null);
  let editUrl = $state('');
  let editLabel = $state('');
  let editKind = $state<LinkKind>('other');

  /** Links group under their kind; the order here is the order on screen. */
  const grouped = $derived.by(() => {
    const map = new Map<LinkKind, Link[]>();
    for (const link of links) {
      const k = linkKindOf(link.kind);
      const list = map.get(k);
      if (list) list.push(link);
      else map.set(k, [link]);
    }
    return LINK_KINDS.filter((k) => map.has(k)).map((k) => ({ kind: k, items: map.get(k)! }));
  });

  /** More than one group is what makes the headings worth their vertical space. */
  const showHeadings = $derived(grouped.length > 1);

  function onNewUrlInput(value: string) {
    newUrl = value;
    if (!kindTouched) newKind = guessLinkKind(value.trim());
  }

  function startAdding() {
    adding = true;
    newUrl = '';
    newLabel = '';
    newKind = 'other';
    kindTouched = false;
  }

  function cancelAdding() {
    adding = false;
    newUrl = '';
    newLabel = '';
    newKind = 'other';
    kindTouched = false;
  }

  async function add() {
    if (saving) return;
    const url = newUrl.trim();
    if (!url) return;
    saving = true;
    try {
      const res = await fetch(`/api/projects/${projectId}/links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, label: newLabel.trim() || null, kind: newKind })
      });
      if (!res.ok) {
        const code = await readErrorCode(res);
        toast.danger(
          code === 'bad_scheme'
            ? 'Only http(s) links are allowed.'
            : code === 'missing_url'
              ? 'Paste a URL first.'
              : 'Could not save link.'
        );
        return;
      }
      cancelAdding();
      await invalidateAll();
    } finally {
      saving = false;
    }
  }

  function startEditing(link: Link) {
    editingId = link.id;
    editUrl = link.url;
    editLabel = link.label ?? '';
    editKind = linkKindOf(link.kind);
  }

  function cancelEditing() {
    editingId = null;
    editUrl = '';
    editLabel = '';
    editKind = 'other';
  }

  async function commitEdit() {
    if (saving || !editingId) return;
    saving = true;
    try {
      const res = await fetch(`/api/projects/${projectId}/links`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          url: editUrl.trim(),
          label: editLabel.trim() || null,
          kind: editKind
        })
      });
      if (!res.ok) {
        toast.danger('Could not update link.');
        return;
      }
      cancelEditing();
      await invalidateAll();
    } finally {
      saving = false;
    }
  }

  async function remove(linkId: string) {
    if (saving) return;
    saving = true;
    try {
      const res = await fetch(`/api/projects/${projectId}/links`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: linkId })
      });
      if (!res.ok) {
        toast.danger('Could not remove link.');
        return;
      }
      await invalidateAll();
    } finally {
      saving = false;
    }
  }

  function hostnameOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
</script>

<div class="flex flex-col gap-2">
  {#if links.length === 0 && !adding}
    <p class="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-center text-xs text-[var(--color-muted)]">
      No links yet. Paste a Drive, Notion, or Dropbox URL to attach it to this project.
    </p>
  {/if}
  {#if links.length > 0}
    <div class="flex flex-col gap-3">
    {#each grouped as group (group.kind)}
    {#if showHeadings}
      <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">
        {LINK_KIND_LABELS[group.kind]}
      </h3>
    {/if}
    <ul class="flex flex-col gap-1">
      {#each group.items as link (link.id)}
        <li>
          {#if editingId === link.id}
            <div class="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
              <input
                bind:value={editUrl}
                type="url"
                class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
              />
              <input
                bind:value={editLabel}
                placeholder="Label (optional)"
                class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
              />
              <select
                bind:value={editKind}
                aria-label="Link type"
                class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
              >
                {#each LINK_KINDS as k (k)}
                  <option value={k}>{LINK_KIND_LABELS[k]}</option>
                {/each}
              </select>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  onclick={commitEdit}
                  disabled={saving}
                  class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-2 py-1 text-xs text-[var(--color-accent-fg)]"
                ><Check size={12} strokeWidth={2} /> Save</button>
                <button
                  type="button"
                  onclick={cancelEditing}
                  class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-bg)]"
                  aria-label="Cancel"
                ><X size={12} strokeWidth={2} /></button>
              </div>
            </div>
          {:else}
            <div class="group flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
              <ExternalLink size={12} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
              <a
                href={link.url}
                target="_blank"
                rel="nofollow noopener noreferrer"
                class="min-w-0 flex-1 truncate"
              >
                <span class="font-medium">{link.label ?? hostnameOf(link.url)}</span>
                {#if link.label}
                  <span class="ml-1 text-xs text-[var(--color-muted)]">{hostnameOf(link.url)}</span>
                {/if}
              </a>
              <span class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onclick={() => startEditing(link)}
                  title="Edit"
                  class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-bg)]"
                ><Pencil size={12} strokeWidth={2} /></button>
                <button
                  type="button"
                  onclick={() => remove(link.id)}
                  title="Remove"
                  class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
                ><Trash2 size={12} strokeWidth={2} /></button>
              </span>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    {/each}
    </div>
  {/if}
  {#if adding}
    <div class="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        value={newUrl}
        oninput={(e) => onNewUrlInput(e.currentTarget.value)}
        type="url"
        placeholder="https://…"
        autofocus
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') cancelAdding(); }}
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
      />
      <input
        bind:value={newLabel}
        placeholder="Label (optional, e.g. 'Term sheet')"
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') cancelAdding(); }}
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
      />
      <select
        bind:value={newKind}
        onchange={() => (kindTouched = true)}
        aria-label="Link type"
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
      >
        {#each LINK_KINDS as k (k)}
          <option value={k}>{LINK_KIND_LABELS[k]}</option>
        {/each}
      </select>
      <div class="flex items-center gap-1">
        <button
          type="button"
          onclick={add}
          disabled={saving || !newUrl.trim()}
          class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-2 py-1 text-xs text-[var(--color-accent-fg)] disabled:opacity-60"
        ><Check size={12} strokeWidth={2} /> Add link</button>
        <button
          type="button"
          onclick={cancelAdding}
          class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] hover:bg-[var(--color-bg)]"
          aria-label="Cancel"
        ><X size={12} strokeWidth={2} /></button>
      </div>
    </div>
  {:else}
    <button
      type="button"
      onclick={startAdding}
      class="inline-flex items-center gap-1 self-start rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-highlight-border)] hover:bg-[var(--color-highlight-bg)] hover:text-[var(--color-text)]"
    >
      <Plus size={12} strokeWidth={2} />
      Add link
    </button>
  {/if}
</div>
