<script lang="ts">
  /**
   * Start/stop, with the project and description editable while it runs.
   *
   * The elapsed time ticks from a local `setInterval` computing against
   * `startedAt` — never a poll. The server already knows when the timer began;
   * asking it again every second would be a request per second per open tab to
   * learn something arithmetic can tell us.
   */
  import { Play, Square } from 'lucide-svelte';
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/toasts.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { formatMinutes } from '$lib/duration';
  import type { TimeEntryRow } from '$lib/server/time';

  type Props = {
    running: TimeEntryRow | null;
    projects: { id: string; name: string }[];
  };
  let { running, projects }: Props = $props();

  let description = $state('');
  let projectId = $state('');
  let busy = $state(false);

  // Carry the running entry's own values into the fields when one exists, so
  // the bar shows what is being tracked rather than an empty form.
  $effect(() => {
    description = running?.description ?? '';
    projectId = running?.projectId ?? '';
  });

  let now = $state(Date.now());
  $effect(() => {
    if (!running) return;
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  /** `1:04:09` — seconds matter while it is running, in a way they never do after. */
  const elapsed = $derived.by(() => {
    if (!running) return '0:00:00';
    const total = Math.max(0, Math.floor((now - running.startedAt) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  });

  async function start() {
    if (busy) return;
    busy = true;
    try {
      const res = await fetch('/api/time/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: description.trim() || null, projectId: projectId || null })
      });
      if (!res.ok) throw new Error();
      await invalidateAll();
    } catch {
      toast.danger('Could not start the timer');
    } finally {
      busy = false;
    }
  }

  async function stop() {
    if (busy || !running) return;
    busy = true;
    try {
      const res = await fetch('/api/time/stop', { method: 'POST' });
      if (!res.ok) throw new Error();
      await invalidateAll();
      toast.success('Stopped');
    } catch {
      toast.danger('Could not stop the timer');
    } finally {
      busy = false;
    }
  }

  /** Editing a live timer patches the row it is already writing. */
  async function patchRunning(body: Record<string, unknown>) {
    if (!running) return;
    const res = await fetch(`/api/time/${running.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) toast.danger('Update failed');
    else await invalidateAll();
  }
</script>

<div
  class="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border bg-[var(--color-surface)] p-3 {running
    ? 'border-[var(--color-accent)]'
    : 'border-[var(--color-border)]'}"
>
  <input
    bind:value={description}
    onblur={() => running && description !== (running.description ?? '')
      ? patchRunning({ description: description.trim() || null })
      : undefined}
    onkeydown={(e) => {
      if (e.key === 'Enter') { e.preventDefault(); running ? stop() : start(); }
    }}
    placeholder="What are you working on?"
    class="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
  />

  <select
    bind:value={projectId}
    onchange={() => running && patchRunning({ projectId: projectId || null })}
    aria-label="Project"
    class="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm"
  >
    <option value="">No project</option>
    {#each projects as p (p.id)}
      <option value={p.id}>{p.name}</option>
    {/each}
  </select>

  <span
    class="min-w-[5.5rem] text-right text-lg tabular-nums {running
      ? 'font-semibold text-[var(--color-text)]'
      : 'text-[var(--color-subtle)]'}"
    aria-live="off"
  >{elapsed}</span>

  {#if running}
    <Button variant="danger" onclick={stop} loading={busy}>
      <Square size={13} strokeWidth={2} /> Stop
    </Button>
  {:else}
    <Button variant="primary" onclick={start} loading={busy}>
      <Play size={13} strokeWidth={2} /> Start
    </Button>
  {/if}
</div>

{#if running && running.billable}
  <p class="text-xs text-[var(--color-muted)]">
    Billable{running.hourlyRate ? ` at ${(running.hourlyRate / 100).toFixed(2)} ${running.currency ?? ''}/h` : ''}.
    Tracking {formatMinutes(Math.floor((now - running.startedAt) / 60_000))} so far.
  </p>
{/if}
