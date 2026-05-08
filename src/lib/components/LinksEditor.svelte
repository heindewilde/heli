<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Plus, Trash2, ExternalLink, Pencil, Check, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';

  type Link = { id: string; url: string; label: string | null };

  type Props = {
    projectId: string;
    links: Link[];
  };

  let { projectId, links }: Props = $props();

  let adding = $state(false);
  let newUrl = $state('');
  let newLabel = $state('');
  let saving = $state(false);
  let editingId = $state<string | null>(null);
  let editUrl = $state('');
  let editLabel = $state('');

  function startAdding() {
    adding = true;
    newUrl = '';
    newLabel = '';
  }

  function cancelAdding() {
    adding = false;
    newUrl = '';
    newLabel = '';
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
        body: JSON.stringify({ url, label: newLabel.trim() || null })
      });
      if (!res.ok) {
        const code = await res.text().catch(() => '');
        toast.danger(
          code.includes('bad_scheme')
            ? 'Only http(s) links are allowed.'
            : code.includes('missing_url')
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
  }

  function cancelEditing() {
    editingId = null;
    editUrl = '';
    editLabel = '';
  }

  async function commitEdit() {
    if (saving || !editingId) return;
    saving = true;
    try {
      const res = await fetch(`/api/projects/${projectId}/links`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: editingId, url: editUrl.trim(), label: editLabel.trim() || null })
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
    <ul class="flex flex-col gap-1">
      {#each links as link (link.id)}
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
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  onclick={commitEdit}
                  disabled={saving}
                  class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-product)] px-2 py-1 text-xs text-white"
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
  {/if}
  {#if adding}
    <div class="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={newUrl}
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
      <div class="flex items-center gap-1">
        <button
          type="button"
          onclick={add}
          disabled={saving || !newUrl.trim()}
          class="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-product)] px-2 py-1 text-xs text-white disabled:opacity-60"
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
      class="inline-flex items-center gap-1 self-start rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-product-border)] hover:bg-[var(--color-product-bg)] hover:text-[var(--color-product)]"
    >
      <Plus size={12} strokeWidth={2} />
      Add link
    </button>
  {/if}
</div>
