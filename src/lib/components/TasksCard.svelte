<script lang="ts">
  import { Calendar, CheckSquare, X } from 'lucide-svelte';
  import { toast } from '$lib/toasts.svelte';
  import { autofocus } from '$lib/actions';
  import type { Task, MemberKind } from '$lib/server/schema';

  type Props = {
    kind: MemberKind;
    refId: string;
    tasks: Task[];
  };

  let { kind, refId, tasks: initial }: Props = $props();

  // Local optimistic state; resync when server data changes.
  // svelte-ignore state_referenced_locally
  let items = $state<Task[]>([...initial]);
  $effect(() => {
    items = [...initial];
  });

  let title = $state('');
  let dueDraft = $state('');
  let showDue = $state(false);
  let adding = $state(false);
  let editingId = $state<string | null>(null);
  let editDraft = $state('');

  const open = $derived(items.filter((t) => t.completedAt == null));
  const done = $derived(items.filter((t) => t.completedAt != null));

  function fmtDue(ts: number | null): string {
    if (ts == null) return '';
    const d = new Date(ts);
    const today = new Date();
    const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (sameDay(d, today)) return 'Today';
    if (sameDay(d, tomorrow)) return 'Tomorrow';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function toDatetimeLocal(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function add() {
    const next = title.trim();
    if (!next || adding) return;
    adding = true;
    const dueAt = dueDraft ? new Date(dueDraft).getTime() : null;
    const tempId = `temp-${Date.now()}`;
    const now = Date.now();
    const optimistic: Task = {
      id: tempId,
      userId: '',
      kind,
      refId,
      title: next,
      dueAt: dueAt && Number.isFinite(dueAt) ? dueAt : null,
      completedAt: null,
      createdAt: now,
      updatedAt: now
    };
    items = [optimistic, ...items];
    title = '';
    dueDraft = '';
    showDue = false;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, refId, title: next, dueAt })
      });
      if (!res.ok) throw new Error('create_failed');
      const saved: Task = await res.json();
      items = items.map((t) => (t.id === tempId ? saved : t));
    } catch {
      items = items.filter((t) => t.id !== tempId);
      toast.danger('Could not add task');
    } finally {
      adding = false;
    }
  }

  async function toggle(t: Task) {
    if (t.id.startsWith('temp-')) return;
    const before = t.completedAt;
    const next = before == null ? Date.now() : null;
    items = items.map((x) => (x.id === t.id ? { ...x, completedAt: next } : x));
    const res = await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completedAt: next })
    });
    if (!res.ok) {
      items = items.map((x) => (x.id === t.id ? { ...x, completedAt: before } : x));
      toast.danger('Update failed');
    }
  }

  function startEdit(t: Task) {
    if (t.id.startsWith('temp-')) return;
    editingId = t.id;
    editDraft = t.title;
  }

  async function commitEdit(t: Task) {
    const next = editDraft.trim();
    const stopEditing = () => {
      editingId = null;
      editDraft = '';
    };
    if (!next || next === t.title) {
      stopEditing();
      return;
    }
    const before = t.title;
    items = items.map((x) => (x.id === t.id ? { ...x, title: next } : x));
    stopEditing();
    const res = await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: next })
    });
    if (!res.ok) {
      items = items.map((x) => (x.id === t.id ? { ...x, title: before } : x));
      toast.danger('Update failed');
    }
  }

  async function clearDue(t: Task) {
    if (t.id.startsWith('temp-')) return;
    const before = t.dueAt;
    items = items.map((x) => (x.id === t.id ? { ...x, dueAt: null } : x));
    const res = await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dueAt: null })
    });
    if (!res.ok) {
      items = items.map((x) => (x.id === t.id ? { ...x, dueAt: before } : x));
      toast.danger('Update failed');
    }
  }

  async function setDue(t: Task, value: string) {
    if (t.id.startsWith('temp-')) return;
    const before = t.dueAt;
    const ts = value ? new Date(value).getTime() : null;
    if (ts != null && !Number.isFinite(ts)) return;
    items = items.map((x) => (x.id === t.id ? { ...x, dueAt: ts } : x));
    const res = await fetch(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dueAt: ts })
    });
    if (!res.ok) {
      items = items.map((x) => (x.id === t.id ? { ...x, dueAt: before } : x));
      toast.danger('Update failed');
    }
  }

  async function remove(t: Task) {
    if (t.id.startsWith('temp-')) return;
    const before = items;
    items = items.filter((x) => x.id !== t.id);
    const res = await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
    if (!res.ok) {
      items = before;
      toast.danger('Delete failed');
    }
  }

  function isOverdue(t: Task): boolean {
    return t.completedAt == null && t.dueAt != null && t.dueAt < Date.now();
  }
</script>

<div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
  <h3 class="text-xs font-medium uppercase tracking-wide text-[var(--color-subtle)]">Tasks</h3>

  <form
    onsubmit={(e) => {
      e.preventDefault();
      add();
    }}
    class="flex flex-col gap-1.5"
  >
    <div class="flex items-center gap-1.5">
      <input
        bind:value={title}
        placeholder="Add a task…"
        class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm outline-none focus:border-[var(--color-highlight-border)]"
      />
      <button
        type="button"
        onclick={() => (showDue = !showDue)}
        aria-label="Set due date"
        title="Due date"
        class="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-bg)] {showDue || dueDraft ? 'text-[var(--color-muted)]' : ''}"
      >
        <Calendar size={14} strokeWidth={2} />
      </button>
    </div>
    {#if showDue}
      <input
        type="datetime-local"
        bind:value={dueDraft}
        class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
      />
    {/if}
  </form>

  {#if items.length === 0}
    <p class="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] p-3 text-center text-xs text-[var(--color-muted)]">
      No tasks yet.
    </p>
  {:else}
    <ul class="flex flex-col">
      {#each open as t (t.id)}
        <li class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 hover:bg-[var(--color-bg)]">
          <button
            type="button"
            onclick={() => toggle(t)}
            aria-label="Mark complete"
            class="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] hover:text-[var(--color-text)]"
          >
            <span class="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-[var(--color-border-strong,var(--color-border))]"></span>
          </button>
          {#if editingId === t.id}
            <input
              bind:value={editDraft}
              onblur={() => commitEdit(t)}
              onkeydown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdit(t); }
                if (e.key === 'Escape') { editingId = null; editDraft = ''; }
              }}
              class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-sm"
              use:autofocus
            />
          {:else}
            <button
              type="button"
              onclick={() => startEdit(t)}
              class="min-w-0 flex-1 truncate text-left text-sm"
            >{t.title}</button>
          {/if}
          {#if t.dueAt != null}
            <label class="relative inline-flex shrink-0 items-center {isOverdue(t) ? 'text-[var(--color-warning)]' : 'text-[var(--color-muted)]'}">
              <span class="rounded-full border px-1.5 py-0.5 text-[10px] {isOverdue(t)
                ? 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)]'
                : 'border-[var(--color-border)] bg-[var(--color-bg)]'}">{fmtDue(t.dueAt)}</span>
              <input
                type="datetime-local"
                value={toDatetimeLocal(t.dueAt)}
                onchange={(e) => setDue(t, (e.currentTarget as HTMLInputElement).value)}
                class="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Change due date"
              />
            </label>
            <button
              type="button"
              onclick={() => clearDue(t)}
              aria-label="Clear due date"
              class="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-surface)] group-hover:opacity-100"
            >
              <X size={10} strokeWidth={2} />
            </button>
          {:else}
            <label class="relative inline-flex shrink-0">
              <button
                type="button"
                aria-label="Set due date"
                class="rounded-[var(--radius-sm)] p-0.5 text-[var(--color-subtle)] opacity-0 hover:bg-[var(--color-surface)] group-hover:opacity-100"
                tabindex="-1"
              >
                <Calendar size={11} strokeWidth={2} />
              </button>
              <input
                type="datetime-local"
                onchange={(e) => setDue(t, (e.currentTarget as HTMLInputElement).value)}
                class="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Set due date"
              />
            </label>
          {/if}
          <button
            type="button"
            onclick={() => remove(t)}
            aria-label="Delete task"
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
        {#each done as t (t.id)}
          <li class="group flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1 text-[var(--color-muted)] hover:bg-[var(--color-bg)]">
            <button
              type="button"
              onclick={() => toggle(t)}
              aria-label="Mark incomplete"
              class="shrink-0 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-accent)]"
            >
              <CheckSquare size={14} strokeWidth={2} />
            </button>
            <span class="min-w-0 flex-1 truncate text-sm line-through">{t.title}</span>
            <button
              type="button"
              onclick={() => remove(t)}
              aria-label="Delete task"
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
