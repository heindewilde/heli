<script lang="ts">
  /**
   * A project's measurable targets — "ship 12 posts", 7 done.
   *
   * The progress bar is a plain div with a `--p` percentage custom property,
   * the same technique as admin/Histogram.svelte. No SVG and no charting
   * dependency for what is one filled rectangle.
   *
   * Optimistic-with-rollback like MilestonesCard; the card owns its list.
   */
  import { Target, X, Minus, Plus } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import { autofocus } from '$lib/actions';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import type { ProjectGoal } from '$lib/server/schema';

  type Props = { projectId: string; goals: ProjectGoal[] };
  let { projectId, goals: initial }: Props = $props();

  // svelte-ignore state_referenced_locally
  let items = $state<ProjectGoal[]>([...initial]);
  $effect(() => {
    items = [...initial];
  });

  let title = $state('');
  let target = $state('');
  let unit = $state('');
  let adding = $state(false);
  let editingId = $state<string | null>(null);
  let editDraft = $state('');

  const endpoint = $derived(`/api/projects/${projectId}/goals`);
  const isTemp = (g: ProjectGoal) => g.id.startsWith('temp-');

  function pct(g: ProjectGoal): number {
    if (g.targetValue <= 0) return 0;
    return Math.min(100, Math.round((g.currentValue / g.targetValue) * 100));
  }

  async function patch(g: ProjectGoal, body: Partial<ProjectGoal>) {
    if (isTemp(g)) return;
    const before = items;
    items = items.map((x) => (x.id === g.id ? { ...x, ...body } : x));
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: g.id, ...body })
    });
    if (!res.ok) {
      items = before;
      toast.danger('Update failed');
    }
  }

  /** Clamped at both ends: the server rejects negatives, and past the target is not progress. */
  function step(g: ProjectGoal, by: number) {
    const next = Math.max(0, Math.min(g.targetValue, g.currentValue + by));
    if (next === g.currentValue) return;
    patch(g, { currentValue: next });
  }

  async function add() {
    const name = title.trim();
    const targetValue = Number(target);
    if (!name || adding) return;
    if (!Number.isInteger(targetValue) || targetValue <= 0) {
      toast.danger('Target must be a whole number above zero');
      return;
    }
    adding = true;
    const unitValue = unit.trim() || null;
    const tempId = `temp-${Date.now()}`;
    const now = Date.now();
    const optimistic: ProjectGoal = {
      id: tempId,
      projectId,
      title: name,
      unit: unitValue,
      targetValue,
      currentValue: 0,
      dueAt: null,
      position: items.length,
      createdAt: now,
      updatedAt: now
    };
    items = [...items, optimistic];
    title = '';
    target = '';
    unit = '';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: name, targetValue, unit: unitValue })
      });
      if (!res.ok) throw new Error('create_failed');
      const { id } = (await res.json()) as { id: string };
      items = items.map((g) => (g.id === tempId ? { ...g, id } : g));
    } catch {
      items = items.filter((g) => g.id !== tempId);
      toast.danger('Could not add goal');
    } finally {
      adding = false;
    }
  }

  function startEdit(g: ProjectGoal) {
    if (isTemp(g)) return;
    editingId = g.id;
    editDraft = g.title;
  }

  async function commitEdit(g: ProjectGoal) {
    const next = editDraft.trim();
    editingId = null;
    editDraft = '';
    if (!next || next === g.title) return;
    await patch(g, { title: next });
  }

  async function remove(g: ProjectGoal) {
    if (isTemp(g)) return;
    const before = items;
    items = items.filter((x) => x.id !== g.id);
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: g.id })
    });
    if (!res.ok) {
      items = before;
      toast.danger('Delete failed');
    }
  }

  const fieldClass =
    'min-w-0 rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1.5 py-0.5 text-sm outline-none placeholder:text-[var(--color-subtle)] focus:border-[var(--color-border)]';
</script>

<div class="flex flex-col gap-2">
  <h2 class="text-sm font-semibold text-[var(--color-text)]">Goals</h2>

  <form
    onsubmit={(e) => {
      e.preventDefault();
      add();
    }}
    class="flex w-full flex-wrap items-center gap-1 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 transition-colors focus-within:border-[var(--color-border-strong)] focus-within:bg-[var(--color-bg)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg)]"
  >
    <input bind:value={title} placeholder="Add a goal…" class="flex-1 {fieldClass}" />
    <input
      bind:value={target}
      type="number"
      min="1"
      step="1"
      inputmode="numeric"
      placeholder="12"
      aria-label="Target"
      class="w-16 text-right tabular-nums {fieldClass}"
    />
    <input
      bind:value={unit}
      placeholder="posts"
      aria-label="Unit"
      maxlength="24"
      class="w-20 {fieldClass}"
    />
  </form>

  {#if items.length === 0}
    <EmptyState
      icon={Target}
      title="No goals yet"
      description="Track something countable — deliverables shipped, sessions run, percent complete."
      bordered={false}
      compact
    />
  {:else}
    <ul class="flex flex-col gap-1">
      {#each items as g (g.id)}
        {@const p = pct(g)}
        {@const complete = g.currentValue >= g.targetValue}
        <li class="group flex flex-col gap-1 rounded-[var(--radius-sm)] px-1 py-1.5 hover:bg-[var(--color-surface)]">
          <div class="flex items-center gap-2">
            {#if editingId === g.id}
              <input
                bind:value={editDraft}
                onblur={() => commitEdit(g)}
                onkeydown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(g); }
                  if (e.key === 'Escape') { editingId = null; editDraft = ''; }
                }}
                class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-sm"
                use:autofocus
              />
            {:else}
              <button
                type="button"
                onclick={() => startEdit(g)}
                class="min-w-0 flex-1 truncate text-left text-sm"
              >{g.title}</button>
            {/if}

            <div class="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onclick={() => step(g, -1)}
                aria-label="Decrease {g.title}"
                disabled={g.currentValue === 0}
                class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-30 group-hover:opacity-100"
              ><Minus size={11} strokeWidth={2} /></button>
              <span class="min-w-[4.5rem] text-right text-xs tabular-nums text-[var(--color-muted)]">
                {g.currentValue} / {g.targetValue}{g.unit ? ` ${g.unit}` : ''}
              </span>
              <button
                type="button"
                onclick={() => step(g, 1)}
                aria-label="Increase {g.title}"
                disabled={complete}
                class="rounded-[var(--radius-sm)] p-1 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-30 group-hover:opacity-100"
              ><Plus size={11} strokeWidth={2} /></button>
            </div>

            <button
              type="button"
              onclick={() => remove(g)}
              aria-label="Delete {g.title}"
              class="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] group-hover:opacity-100"
            ><X size={11} strokeWidth={2} /></button>
          </div>

          <div
            class="track"
            role="progressbar"
            aria-label={g.title}
            aria-valuenow={g.currentValue}
            aria-valuemin={0}
            aria-valuemax={g.targetValue}
          >
            <div class="fill" class:complete style="--p: {p}%"></div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .track {
    height: 6px;
    border-radius: 999px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    width: var(--p);
    background: var(--color-accent);
    transition: width 160ms ease-out;
  }
  .fill.complete {
    background: var(--color-success);
  }
</style>
