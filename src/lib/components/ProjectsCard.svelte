<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { FolderKanban, Plus, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import StatusChip from './StatusChip.svelte';
  import type { ProjectStatus, MemberKind } from '$lib/server/schema';
  import Popover from '$lib/ui/Popover.svelte';
  import Combobox from '$lib/ui/Combobox.svelte';

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

  type Candidate = { id: string; name: string; status: ProjectStatus };

  let pickerOpen = $state(false);

  const memberOf = $derived(new Set(projects.map((p) => p.id)));

  async function search(q: string): Promise<Candidate[]> {
    const r = await fetch(`/api/projects?mode=typeahead&q=${encodeURIComponent(q)}&limit=20`);
    if (!r.ok) return [];
    const data = await r.json();
    return ((data.items ?? []) as Candidate[]).filter((c) => !memberOf.has(c.id));
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

  <footer class="border-t border-[var(--color-border)]">
    <Popover
      bind:open={pickerOpen}
      label="Add to project"
      panelRole="dialog"
      placement="top-start"
      matchWidth
      autoFocus={false}
      class="w-full"
    >
      {#snippet trigger(attrs)}
        <button
          {...attrs}
          type="button"
          class="flex w-full items-center justify-center gap-1.5 rounded-b-[var(--radius-md)] px-3 py-2 text-xs text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
        >
          <Plus size={12} strokeWidth={2} />
          Add to project
        </button>
      {/snippet}

      {#snippet content()}
        <Combobox
          {search}
          getId={(p) => p.id}
          searchOnOpen
          placeholder="Search projects\u2026"
          emptyText="No matching projects. Create one from the Projects tab."
          onSelect={(p) => add(p.id)}
        >
          {#snippet option(p: Candidate)}
            <FolderKanban size={12} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
            <span class="min-w-0 flex-1 truncate">{p.name}</span>
            <StatusChip status={p.status} size="sm" />
          {/snippet}
        </Combobox>
      {/snippet}
    </Popover>
  </footer>
</div>
