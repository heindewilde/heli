<script lang="ts">
  /**
   * The contents of the selection toolbar on `/people` and `/companies`.
   *
   * Shared rather than written twice, because the two lists differ in exactly
   * one thing — the `scope` — and everything else (the endpoint shape, the
   * pickers, the confirm copy) is identical. When it was two copies the tag
   * popover and the collection popover had already drifted in the settings
   * screens; this is the same class of duplication caught earlier.
   *
   * It owns no selection state. The page owns the `Selection`, passes the ids
   * in, and decides what to do with the result — because only the page knows
   * whether its list cache can absorb the change or whether the mutation
   * crossed something the cache does not own.
   */
  import { Tag, FolderPlus, Flag, Circle, Trash2, Send, Download, Loader2 } from 'lucide-svelte';
  import Popover from '$lib/ui/Popover.svelte';
  import Combobox from '$lib/ui/Combobox.svelte';
  import MenuItem from '$lib/ui/MenuItem.svelte';
  import Dialog from '$lib/ui/Dialog.svelte';
  import Button from '$lib/ui/Button.svelte';
  import CollectionIcon from '$lib/components/CollectionIcon.svelte';
  import { PRIORITIES, toneColor, type Priority } from '$lib/priority';
  import { TONE_STYLES, type StatusRow } from '$lib/statuses';
  import { toast } from '$lib/toasts.svelte';
  import { downloadPost } from '$lib/client/download';

  type Scope = 'person' | 'company';
  type TagOption = { id: string; name: string; slug: string; count?: number };
  type TemplateOption = { id: string; name: string; platform: string };

  type Props = {
    scope: Scope;
    ids: string[];
    statuses: StatusRow[];
    /** Workspace tags for this scope, already loaded by the page. */
    tags: TagOption[];

    /** True while the caller may not delete — hides the destructive action. */
    canDelete?: boolean;
    onPriority: (next: Priority) => void;
    onStatus: (next: string | null) => void;
    onTag: (op: 'add' | 'remove', tag: { name?: string; tagId?: string }) => void;
    onCollection: (collectionId: string) => void;
    onDelete: () => void;
  };

  let {
    scope,
    ids,
    statuses,
    tags,
    canDelete = true,
    onPriority,
    onStatus,
    onTag,
    onCollection,
    onDelete
  }: Props = $props();

  const noun = $derived(scope === 'person' ? 'people' : 'companies');

  /**
   * The one action here that runs itself rather than calling back to the page.
   *
   * The callback convention above exists because only the page knows whether
   * its list cache can absorb a mutation — and an export mutates nothing, so
   * there is no result to absorb and no reason to make both pages write the
   * same twenty lines. It POSTs because a selection can be hundreds of ids,
   * which is more than a URL will carry.
   */
  let exporting = $state(false);

  async function runExport() {
    if (exporting || ids.length === 0) return;
    exporting = true;
    const ok = await downloadPost(
      '/api/export',
      { kind: noun, ids },
      `heli-${noun}-${new Date().toISOString().slice(0, 10)}.csv`
    );
    if (!ok) toast.danger('Export failed');
    exporting = false;
  }

  /**
   * Templates are fetched when the popover opens, not passed in.
   *
   * The root layout already loads summaries, but it streams them as an
   * unawaited promise so HTML ships before that query resolves — awaiting it
   * here to filter by target would undo that on every list navigation, for a
   * menu most visits never open. `?target=` narrows server-side, so what comes
   * back is exactly what this scope can run.
   */
  let templates = $state<TemplateOption[]>([]);
  let templatesLoaded = $state(false);

  async function loadTemplates() {
    if (templatesLoaded) return;
    templatesLoaded = true;
    try {
      const r = await fetch(`/api/outreach?target=${scope}`);
      if (!r.ok) return;
      const body = await r.json();
      templates = (body.items ?? []) as TemplateOption[];
    } catch {
      templates = [];
    }
  }

  let confirmOpen = $state(false);
  let creatingCollection = $state(false);

  type Candidate = { id: string; name: string; isArchived: number };

  async function searchCollections(q: string): Promise<Candidate[]> {
    const r = await fetch(`/api/collections?mode=typeahead&q=${encodeURIComponent(q)}&limit=20`);
    if (!r.ok) return [];
    const body = await r.json();
    return ((body.items ?? []) as Candidate[]).filter((c) => !c.isArchived);
  }

  async function createCollection(name: string, close: () => void) {
    const trimmed = name.trim();
    if (!trimmed || creatingCollection) return;
    creatingCollection = true;
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
      if (!res.ok) {
        toast.danger('Could not create collection');
        return;
      }
      const body = await res.json();
      if (body.id) {
        close();
        onCollection(body.id);
      }
    } finally {
      creatingCollection = false;
    }
  }

  function searchTags(q: string): TagOption[] {
    const needle = q.trim().toLowerCase();
    const pool = needle ? tags.filter((t) => t.name.toLowerCase().includes(needle)) : tags;
    return pool.slice(0, 20);
  }

  /**
   * The run screen renders every message up front — that is what keeps Copy
   * inside the click gesture for Safari — so the audience travels in the URL
   * and is bounded by the same cap the endpoint enforces.
   */
  const runHref = $derived((templateId: string) => {
    const param = ids.slice(0, 200).join(',');
    return `/outreach/${templateId}/run?ids=${encodeURIComponent(param)}`;
  });

  const btn =
    'inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--color-muted)] transition-colors hover:bg-[var(--color-row-hover)] hover:text-[var(--color-text)]';
</script>

<!-- Add to collection -->
<Popover label="Add to collection" placement="top-start">
  {#snippet trigger(attrs)}
    <button {...attrs} type="button" class={btn}>
      <FolderPlus size={13} strokeWidth={2} />
      Collection
    </button>
  {/snippet}
  {#snippet content({ close })}
    <div class="w-64">
      <Combobox
        variant="panel"
        search={searchCollections}
        getId={(c) => c.id}
        searchOnOpen
        placeholder="Add to collection…"
        emptyText="No collections."
        onSelect={(c) => {
          close();
          onCollection(c.id);
        }}
        onCreate={(q) => createCollection(q, close)}
        createLabel={(q) => `Create “${q}” and add`}
      >
        {#snippet option(c, active)}
          <span class="flex items-center gap-2 {active ? 'font-medium' : ''}">
            <CollectionIcon name={null} size={12} class="text-[var(--color-subtle)]" />
            <span class="truncate">{c.name}</span>
          </span>
        {/snippet}
      </Combobox>
    </div>
  {/snippet}
</Popover>

<!-- Tags -->
<Popover label="Tag selection" placement="top-start">
  {#snippet trigger(attrs)}
    <button {...attrs} type="button" class={btn}>
      <Tag size={13} strokeWidth={2} />
      Tag
    </button>
  {/snippet}
  {#snippet content({ close })}
    <div class="w-64">
      <Combobox
        variant="panel"
        search={searchTags}
        getId={(t) => t.id}
        searchOnOpen
        debounce={0}
        placeholder="Apply a tag…"
        emptyText="No tags yet."
        onSelect={(t) => {
          close();
          onTag('add', { tagId: t.id });
        }}
        onCreate={(q) => {
          close();
          onTag('add', { name: q });
        }}
        createLabel={(q) => `Create “${q}” and apply`}
      >
        {#snippet option(t, active)}
          <span class="flex w-full items-center gap-2 {active ? 'font-medium' : ''}">
            <Tag size={11} strokeWidth={2} class="text-[var(--color-subtle)]" />
            <span class="flex-1 truncate">{t.name}</span>
            <!-- Removing is the same picker, one keystroke away, rather than a
                 second popover: the list of tags you might remove is exactly
                 the list you might add. -->
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                close();
                onTag('remove', { tagId: t.id });
              }}
              class="shrink-0 rounded-[var(--radius-sm)] px-1 text-[10px] text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
            >
              remove
            </button>
          </span>
        {/snippet}
      </Combobox>
    </div>
  {/snippet}
</Popover>

<!-- Priority -->
<Popover label="Set priority" placement="top-start" panelRole="menu">
  {#snippet trigger(attrs)}
    <button {...attrs} type="button" class={btn}>
      <Flag size={13} strokeWidth={2} />
      Priority
    </button>
  {/snippet}
  {#snippet content({ close })}
    <div class="min-w-[150px] py-1">
      {#each PRIORITIES as p (p.label)}
        {@const color = toneColor(p.tone)}
        <MenuItem
          onclick={() => {
            close();
            onPriority(p.value);
          }}
        >
          {#snippet icon()}
            {#if p.value == null}
              <span class="h-1.5 w-1.5 rounded-full" style="background: {color}"></span>
            {:else}
              <Flag size={11} strokeWidth={2} fill="currentColor" style="color: {color}" />
            {/if}
          {/snippet}
          {p.label}
        </MenuItem>
      {/each}
    </div>
  {/snippet}
</Popover>

<!-- Status -->
<Popover label="Set status" placement="top-start" panelRole="menu">
  {#snippet trigger(attrs)}
    <button {...attrs} type="button" class={btn}>
      <Circle size={13} strokeWidth={2} />
      Status
    </button>
  {/snippet}
  {#snippet content({ close })}
    <div class="min-w-[160px] py-1">
      <MenuItem
        onclick={() => {
          close();
          onStatus(null);
        }}
      >
        {#snippet icon()}
          <span class="h-1.5 w-1.5 rounded-full bg-[var(--color-subtle)]"></span>
        {/snippet}
        No status
      </MenuItem>
      {#each statuses as st (st.id)}
        {@const styles = TONE_STYLES[st.tone]}
        <MenuItem
          onclick={() => {
            close();
            onStatus(st.id);
          }}
        >
          {#snippet icon()}
            <span class="h-1.5 w-1.5 rounded-full" style="background: {styles.dot}"></span>
          {/snippet}
          {st.name}
        </MenuItem>
      {/each}
    </div>
  {/snippet}
</Popover>

<Popover label="Start outreach" placement="top-start" panelRole="menu">
  {#snippet trigger(attrs)}
    <button {...attrs} type="button" class={btn} onfocus={loadTemplates} onpointerenter={loadTemplates} onclick={(e) => { loadTemplates(); attrs.onclick?.(e); }}>
      <Send size={13} strokeWidth={2} />
      Outreach
    </button>
  {/snippet}
  {#snippet content({ close })}
    <div class="min-w-[220px] py-1">
      {#if !templatesLoaded}
        <p class="px-2.5 py-1.5 text-xs text-[var(--color-muted)]">Loading…</p>
      {:else if templates.length === 0}
        <p class="px-2.5 py-1.5 text-xs text-[var(--color-muted)]">
          No {scope === 'company' ? 'company' : 'person'} templates yet.
          <a href={`/outreach/new?target=${scope}`} class="underline">Write one</a>.
        </p>
      {:else}
        {#each templates as t (t.id)}
          <MenuItem href={runHref(t.id)} onclick={close}>{t.name}</MenuItem>
        {/each}
      {/if}
    </div>
  {/snippet}
</Popover>

<button type="button" onclick={runExport} disabled={exporting} class={btn}>
  {#if exporting}
    <Loader2 size={13} strokeWidth={2} class="animate-spin" />
  {:else}
    <Download size={13} strokeWidth={2} />
  {/if}
  Export
</button>

{#if canDelete}
  <button type="button" onclick={() => (confirmOpen = true)} class="{btn} hover:text-[var(--color-danger)]">
    <Trash2 size={13} strokeWidth={2} />
    Delete
  </button>
{/if}

<Dialog open={confirmOpen} label="Confirm delete" onclose={() => (confirmOpen = false)} panelClass="w-[min(28rem,92vw)] p-5">
  {#snippet children({ close })}
    <h2 class="text-base font-semibold text-[var(--color-text)]">
      Delete {ids.length}
      {ids.length === 1 ? (scope === 'person' ? 'person' : 'company') : noun}?
    </h2>
    <p class="mt-2 text-sm text-[var(--color-muted)]">
      This cannot be undone. Interactions stay, but they lose their link to
      {ids.length === 1 ? 'this record' : 'these records'}.
    </p>
    <div class="mt-4 flex justify-end gap-2">
      <Button variant="secondary" onclick={close}>Cancel</Button>
      <Button
        variant="danger"
        onclick={() => {
          close();
          onDelete();
        }}>Delete</Button
      >
    </div>
  {/snippet}
</Dialog>
