<script lang="ts">
  /**
   * A project's dated checkpoints.
   *
   * Optimistic-with-rollback throughout, the same shape as TasksCard: the
   * parent page streams the list in, this holds a local copy, and every
   * mutation applies immediately and reverts on a non-ok response. No
   * `invalidateAll()` — the card owns everything it renders.
   */
  import { CheckSquare, Flag, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import { autofocus } from '$lib/actions';
  import DueDatePicker from './DueDatePicker.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import type { ProjectMilestone } from '$lib/server/schema';

  type Props = { projectId: string; milestones: ProjectMilestone[] };
  let { projectId, milestones: initial }: Props = $props();

  // svelte-ignore state_referenced_locally
  let items = $state<ProjectMilestone[]>([...initial]);
  $effect(() => {
    items = [...initial];
  });

  let title = $state('');
  let dueDraft = $state<number | null>(null);
  let adding = $state(false);
  let editingId = $state<string | null>(null);
  let editDraft = $state('');

  const endpoint = $derived(`/api/projects/${projectId}/milestones`);

  const open = $derived(items.filter((m) => m.completedAt == null));
  const done = $derived(items.filter((m) => m.completedAt != null));

  const isTemp = (m: ProjectMilestone) => m.id.startsWith('temp-');

  /** One PATCH helper for every field edit, with the rollback built in. */
  async function patch(m: ProjectMilestone, body: Partial<ProjectMilestone>) {
    if (isTemp(m)) return;
    const before = items;
    items = items.map((x) => (x.id === m.id ? { ...x, ...body } : x));
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: m.id, ...body })
    });
    if (!res.ok) {
      items = before;
      toast.danger('Update failed');
    }
  }

  async function add() {
    const next = title.trim();
    if (!next || adding) return;
    adding = true;
    const dueAt = dueDraft;
    const tempId = `temp-${Date.now()}`;
    const now = Date.now();
    const optimistic: ProjectMilestone = {
      id: tempId,
      projectId,
      title: next,
      description: null,
      dueAt,
      completedAt: null,
      position: items.length,
      createdAt: now,
      updatedAt: now
    };
    items = [...items, optimistic];
    title = '';
    dueDraft = null;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: next, dueAt })
      });
      if (!res.ok) throw new Error('create_failed');
      const { id } = (await res.json()) as { id: string };
      items = items.map((m) => (m.id === tempId ? { ...m, id } : m));
    } catch {
      items = items.filter((m) => m.id !== tempId);
      toast.danger('Could not add milestone');
    } finally {
      adding = false;
    }
  }

  function startEdit(m: ProjectMilestone) {
    if (isTemp(m)) return;
    editingId = m.id;
    editDraft = m.title;
  }

  async function commitEdit(m: ProjectMilestone) {
    const next = editDraft.trim();
    editingId = null;
    editDraft = '';
    if (!next || next === m.title) return;
    await patch(m, { title: next });
  }

  async function remove(m: ProjectMilestone) {
    if (isTemp(m)) return;
    const before = items;
    items = items.filter((x) => x.id !== m.id);
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: m.id })
    });
    if (!res.ok) {
      items = before;
      toast.danger('Delete failed');
    }
  }

  /** Overdue only matters while the milestone is still open. */
  function isOverdue(m: ProjectMilestone): boolean {
    return m.completedAt == null && m.dueAt != null && m.dueAt < Date.now();
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center justify-between">
    <h2 class="text-sm font-semibold text-[var(--color-text)]">Milestones</h2>
    {#if items.length > 0}
      <span class="text-xs tabular-nums text-[var(--color-subtle)]">
        {done.length} of {items.length}
      </span>
    {/if}
  </div>

  <form
    onsubmit={(e) => {
      e.preventDefault();
      add();
    }}
    class="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed transition-colors focus-within:border-[var(--color-border-strong)] focus-within:bg-[var(--color-bg)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg)]"
  >
    <input
      bind:value={title}
      placeholder="Add a milestone…"
      class="min-w-0 flex-1 bg-transparent text-sm leading-relaxed outline-none placeholder:text-[var(--color-subtle)]"
    />
    <span class="shrink-0">
      <DueDatePicker
        value={dueDraft}
        onChange={(v) => (dueDraft = v)}
        variant={dueDraft == null ? 'icon' : 'chip'}
      />
    </span>
  </form>

  {#if items.length === 0}
    <EmptyState
      icon={Flag}
      title="No milestones yet"
      description="Break the work into dated checkpoints so the plan is visible at a glance."
      bordered={false}
      compact
    />
  {:else}
    <ul class="flex flex-col">
      {#each open as m (m.id)}
        <li class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 hover:bg-[var(--color-surface)]">
          <button
            type="button"
            onclick={() => patch(m, { completedAt: Date.now() })}
            aria-label="Mark {m.title} complete"
            class="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] hover:text-[var(--color-text)]"
          >
            <span class="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-[var(--color-border-strong,var(--color-border))]"></span>
          </button>
          {#if editingId === m.id}
            <input
              bind:value={editDraft}
              onblur={() => commitEdit(m)}
              onkeydown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdit(m); }
                if (e.key === 'Escape') { editingId = null; editDraft = ''; }
              }}
              class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-sm"
              use:autofocus
            />
          {:else}
            <button
              type="button"
              onclick={() => startEdit(m)}
              class="min-w-0 flex-1 truncate text-left text-sm {isOverdue(m) ? 'text-[var(--color-danger)]' : ''}"
            >{m.title}</button>
          {/if}
          <span class="shrink-0 {m.dueAt == null ? 'opacity-0 group-hover:opacity-100' : ''}">
            <DueDatePicker
              value={m.dueAt}
              onChange={(v) => patch(m, { dueAt: v })}
              variant={m.dueAt == null ? 'icon' : 'chip'}
            />
          </span>
          <button
            type="button"
            onclick={() => remove(m)}
            aria-label="Delete {m.title}"
            class="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] group-hover:opacity-100"
          >
            <X size={11} strokeWidth={2} />
          </button>
        </li>
      {/each}

      {#if done.length > 0}
        {#if open.length > 0}
          <li class="my-1 border-t border-[var(--color-border)]"></li>
        {/if}
        {#each done as m (m.id)}
          <li class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 text-[var(--color-muted)] hover:bg-[var(--color-surface)]">
            <button
              type="button"
              onclick={() => patch(m, { completedAt: null })}
              aria-label="Reopen {m.title}"
              class="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-accent)]"
            >
              <CheckSquare size={14} strokeWidth={2} />
            </button>
            <span class="min-w-0 flex-1 truncate text-sm line-through">{m.title}</span>
            <button
              type="button"
              onclick={() => remove(m)}
              aria-label="Delete {m.title}"
              class="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] group-hover:opacity-100"
            >
              <X size={11} strokeWidth={2} />
            </button>
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>
