<script lang="ts">
  /**
   * The header indicator for a timer that is running.
   *
   * Renders nothing when nothing is running, so it costs no space on the pages
   * that are not about time. Deliberately tiny and **statically imported** — a
   * new dynamic import boundary in the root layout is the exact shape that has
   * three times produced a production-only hydration crash here.
   *
   * Ticks locally against `startedAt`; it never polls.
   */
  import { Square } from 'lucide-svelte';
  import { invalidateAll } from '$app/navigation';
  import { toast } from '$lib/toasts.svelte';
  import type { TimeEntryRow } from '$lib/server/time';

  type Props = { entry: TimeEntryRow | null };
  let { entry }: Props = $props();

  let now = $state(Date.now());
  $effect(() => {
    if (!entry) return;
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const elapsed = $derived.by(() => {
    if (!entry) return '';
    const total = Math.max(0, Math.floor((now - entry.startedAt) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  });

  const what = $derived(entry?.projectName ?? entry?.description ?? 'Tracking');

  let stopping = $state(false);
  async function stop() {
    if (stopping) return;
    stopping = true;
    try {
      const res = await fetch('/api/time/stop', { method: 'POST' });
      if (!res.ok) throw new Error();
      await invalidateAll();
    } catch {
      toast.danger('Could not stop the timer');
    } finally {
      stopping = false;
    }
  }
</script>

{#if entry}
  <div class="flex items-center gap-1 rounded-full border border-[var(--color-accent)] bg-[var(--color-surface)] py-0.5 pl-2 pr-0.5">
    <a href="/time" class="flex min-w-0 items-center gap-1.5 text-xs">
      <span class="pulse" aria-hidden="true"></span>
      <span class="hidden max-w-28 truncate sm:inline text-[var(--color-muted)]">{what}</span>
      <span class="font-medium tabular-nums">{elapsed}</span>
    </a>
    <button
      type="button"
      onclick={stop}
      disabled={stopping}
      aria-label="Stop the timer"
      class="rounded-full p-1 text-[var(--color-subtle)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] disabled:opacity-50"
    >
      <Square size={11} strokeWidth={2.5} />
    </button>
  </div>
{/if}

<style>
  .pulse {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--color-danger);
    animation: pulse 2s ease-in-out infinite;
  }
  /* The global reduced-motion rule in app.css already flattens this; no
     per-component media query. */
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
</style>
