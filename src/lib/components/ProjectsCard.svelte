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
    /** IDs of projects shared with the linked company; renders a subtle "w/ company" hint. */
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

<div class="flex flex-col rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
  <header class="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
    <div class="flex items-center gap-1.5">
      <FolderKanban size={12} strokeWidth={2} class="text-[var(--color-subtle)]" />
      <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Projects</h3>
      {#if projects.length > 0}
        <span class="rounded-full bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">{projects.length}</span>
      {/if}
    </div>
  </header>

  <div class="flex flex-1 flex-col gap-1 p-2">
    {#if projects.length === 0}
      <div class="flex flex-col items-center gap-1 px-3 py-4 text-center">
        <FolderKanban size={18} strokeWidth={1.5} class="text-[var(--color-subtle)]" />
        <p class="text-xs text-[var(--color-muted)]">Not in any project</p>
      </div>
    {:else}
      <ul class="flex flex-col">
        {#each projects as p (p.id)}
          <li class="group rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-[var(--color-bg)]">
            <div class="flex items-center gap-2">
              <FolderKanban size={12} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
              <a href={`/projects/${p.id}`} class="min-w-0 flex-1 truncate text-sm hover:underline">{p.name}</a>
              <StatusChip status={p.status as ProjectStatus} size="sm" />
              <button
                type="button"
                onclick={() => remove(p.id)}
                aria-label="Remove from {p.name}"
                class="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] group-hover:opacity-100"
              >
                <X size={11} strokeWidth={2} />
              </button>
            </div>
            {#if sharedIds.has(p.id) && sharedLabel}
              <p class="pl-[18px] text-[10px] text-[var(--color-subtle)]">with {sharedLabel}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <footer class="relative border-t border-[var(--color-border)]">
    <button
      type="button"
      onclick={() => (pickerOpen = !pickerOpen)}
      class="flex w-full items-center justify-center gap-1.5 rounded-b-[var(--radius-md)] px-3 py-2 text-xs text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
    >
      <Plus size={12} strokeWidth={2} />
      Add to project
    </button>
    {#if pickerOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="fixed inset-0 z-30" onclick={() => (pickerOpen = false)}></div>
      <div class="absolute bottom-full left-0 right-0 z-40 mb-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 shadow-[var(--shadow-lg)]">
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
  </footer>
</div>
