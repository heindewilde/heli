<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { FolderKanban, Plus, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import StatusChip from './StatusChip.svelte';
  import type { ProjectStatus, MemberKind } from '$lib/server/schema';

  type ProjectLite = { id: string; name: string; status: string };

  type Props = {
    kind: MemberKind;
    refId: string;
    projects: ProjectLite[];
    /** IDs of projects shared with the linked company; used to add a subtle "w/ company" hint. */
    sharedIds?: Set<string>;
    sharedLabel?: string;
  };

  let { kind, refId, projects, sharedIds = new Set<string>(), sharedLabel = '' }: Props = $props();

  let pickerOpen = $state(false);
  let pickerQuery = $state('');
  let candidates = $state<{ id: string; name: string; status: ProjectStatus }[]>([]);
  let loading = $state(false);

  const memberOf = $derived(new Set(projects.map((p) => p.id)));
  const filtered = $derived(candidates.filter((c) => !memberOf.has(c.id)));

  async function loadCandidates() {
    loading = true;
    try {
      const r = await fetch(
        `/api/projects?mode=typeahead&q=${encodeURIComponent(pickerQuery)}&limit=20`
      );
      if (!r.ok) {
        candidates = [];
        return;
      }
      const data = await r.json();
      candidates = data.items ?? [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (pickerOpen) loadCandidates();
  });

  let queryTimer: ReturnType<typeof setTimeout> | null = null;
  function onQueryChange() {
    if (queryTimer) clearTimeout(queryTimer);
    queryTimer = setTimeout(loadCandidates, 150);
  }

  function bodyForProject(): Record<string, string> {
    return kind === 'person' ? { personId: refId } : { companyId: refId };
  }

  async function add(projectId: string) {
    const endpoint = kind === 'person' ? 'people' : 'companies';
    const res = await fetch(`/api/projects/${projectId}/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyForProject())
    });
    if (!res.ok) {
      toast.danger('Could not add to project');
      return;
    }
    pickerOpen = false;
    pickerQuery = '';
    await invalidateAll();
  }

  async function remove(projectId: string) {
    const endpoint = kind === 'person' ? 'people' : 'companies';
    const res = await fetch(`/api/projects/${projectId}/${endpoint}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyForProject())
    });
    if (!res.ok) {
      toast.danger('Could not remove');
      return;
    }
    await invalidateAll();
  }
</script>

<div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
  <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Projects</h3>
  {#if projects.length === 0}
    <p class="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] p-3 text-center text-xs text-[var(--color-muted)]">
      No projects yet.
    </p>
  {:else}
    <ul class="flex flex-col gap-1">
      {#each projects as p (p.id)}
        <li class="group flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 hover:border-[var(--color-highlight-border)]">
          <a href={`/projects/${p.id}`} class="flex min-w-0 flex-1 items-center gap-2">
            <FolderKanban size={14} strokeWidth={2} class="shrink-0 text-[var(--color-muted)]" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
            {#if sharedIds.has(p.id) && sharedLabel}
              <span class="shrink-0 text-[10px] text-[var(--color-subtle)]">· w/ {sharedLabel}</span>
            {/if}
            <StatusChip status={p.status as ProjectStatus} size="sm" />
          </a>
          <button
            type="button"
            onclick={() => remove(p.id)}
            aria-label="Remove from {p.name}"
            class="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] group-hover:opacity-100"
          >
            <X size={12} strokeWidth={2} />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="relative">
    <button
      type="button"
      onclick={() => (pickerOpen = !pickerOpen)}
      class="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
    >
      <Plus size={10} strokeWidth={2} /> Project
    </button>
    {#if pickerOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="fixed inset-0 z-30"
        onclick={() => (pickerOpen = false)}
      ></div>
      <div class="absolute left-0 top-full z-40 mt-1 w-64 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 shadow-[var(--shadow-lg)]">
        <input
          bind:value={pickerQuery}
          oninput={onQueryChange}
          placeholder="Search projects…"
          class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
        />
        <ul class="mt-1 max-h-60 overflow-y-auto">
          {#if loading}
            <li class="px-2 py-1 text-xs italic text-[var(--color-subtle)]">Loading…</li>
          {:else}
            {#each filtered as p (p.id)}
              <li>
                <button
                  type="button"
                  onclick={() => add(p.id)}
                  class="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm hover:bg-[var(--color-surface)]"
                >
                  <FolderKanban size={12} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
                  <span class="min-w-0 flex-1 truncate">{p.name}</span>
                  <StatusChip status={p.status} size="sm" />
                </button>
              </li>
            {/each}
            {#if filtered.length === 0}
              <li class="px-2 py-1 text-xs italic text-[var(--color-subtle)]">No matching projects. Create one from the Projects tab.</li>
            {/if}
          {/if}
        </ul>
      </div>
    {/if}
  </div>
</div>
