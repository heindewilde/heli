<script lang="ts">
  import { Activity, PauseCircle, Archive, ChevronDown } from 'lucide-svelte';
  import type { ProjectStatus } from '$lib/server/schema';

  type Props = {
    status: ProjectStatus;
    /** When set, clicking opens a small popover that calls back with the chosen status. */
    onChange?: (next: ProjectStatus) => void | Promise<void>;
    size?: 'sm' | 'md';
  };

  let { status, onChange, size = 'sm' }: Props = $props();

  let open = $state(false);
  let panelEl = $state<HTMLDivElement | undefined>(undefined);
  let chipEl = $state<HTMLButtonElement | undefined>(undefined);

  const META: Record<ProjectStatus, { label: string; icon: typeof Activity; tone: string; bg: string; border: string }> = {
    active: {
      label: 'Active',
      icon: Activity,
      tone: 'text-[var(--color-success)]',
      bg: 'bg-[var(--color-success-bg)]',
      border: 'border-[var(--color-success-border)]'
    },
    paused: {
      label: 'Paused',
      icon: PauseCircle,
      tone: 'text-[var(--color-warning)]',
      bg: 'bg-[var(--color-warning-bg)]',
      border: 'border-[var(--color-warning-border)]'
    },
    archived: {
      label: 'Archived',
      icon: Archive,
      tone: 'text-[var(--color-subtle)]',
      bg: 'bg-[var(--color-bg)]',
      border: 'border-[var(--color-border)]'
    }
  };
  const STATUSES: ProjectStatus[] = ['active', 'paused', 'archived'];

  const meta = $derived(META[status]);
  const sizeClasses = $derived(size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-[11px]');

  $effect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelEl?.contains(t) || chipEl?.contains(t)) return;
      open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false;
    };
    const t = setTimeout(() => {
      window.addEventListener('mousedown', onMouseDown);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  });

  async function pick(next: ProjectStatus) {
    open = false;
    if (next === status) return;
    await onChange?.(next);
  }
</script>

<div class="relative inline-block">
  {#if onChange}
    <button
      bind:this={chipEl}
      type="button"
      onclick={(e) => { e.preventDefault(); e.stopPropagation(); open = !open; }}
      class="inline-flex items-center gap-1 rounded-full border {meta.border} {meta.bg} {meta.tone} {sizeClasses} font-medium hover:brightness-95"
      aria-haspopup="listbox"
      aria-expanded={open}
    >
      <meta.icon size={size === 'md' ? 12 : 10} strokeWidth={2} />
      {meta.label}
      <ChevronDown size={size === 'md' ? 12 : 10} strokeWidth={2} class="opacity-60" />
    </button>
  {:else}
    <span class="inline-flex items-center gap-1 rounded-full border {meta.border} {meta.bg} {meta.tone} {sizeClasses} font-medium">
      <meta.icon size={size === 'md' ? 12 : 10} strokeWidth={2} />
      {meta.label}
    </span>
  {/if}
  {#if open && onChange}
    <div
      bind:this={panelEl}
      role="listbox"
      class="absolute left-0 top-full z-30 mt-1 w-36 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]"
    >
      {#each STATUSES as s (s)}
        {@const m = META[s]}
        <button
          type="button"
          role="option"
          aria-selected={s === status}
          onclick={() => pick(s)}
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--color-bg)] {s === status ? 'bg-[var(--color-bg)]' : ''}"
        >
          <m.icon size={12} strokeWidth={2} class={m.tone} />
          <span>{m.label}</span>
          {#if s === status}<span class="ml-auto text-[var(--color-subtle)]">✓</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
