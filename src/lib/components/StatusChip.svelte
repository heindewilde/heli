<script lang="ts">
  import { Activity, PauseCircle, Archive, CheckCircle2, ChevronDown } from 'lucide-svelte';
  import type { ProjectStatus } from '$lib/server/schema';
  import Popover from '$lib/ui/Popover.svelte';

  type Props = {
    status: ProjectStatus;
    /** When set, clicking opens a small popover that calls back with the chosen status. */
    onChange?: (next: ProjectStatus) => void | Promise<void>;
    size?: 'sm' | 'md';
  };

  let { status, onChange, size = 'sm' }: Props = $props();

  let open = $state(false);

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
    completed: {
      label: 'Completed',
      icon: CheckCircle2,
      tone: 'text-[var(--color-info)]',
      bg: 'bg-[var(--color-info-bg)]',
      border: 'border-[var(--color-info-border)]'
    },
    archived: {
      label: 'Archived',
      icon: Archive,
      tone: 'text-[var(--color-subtle)]',
      bg: 'bg-[var(--color-bg)]',
      border: 'border-[var(--color-border)]'
    }
  };
  const STATUSES: ProjectStatus[] = ['active', 'paused', 'completed', 'archived'];

  const meta = $derived(META[status]);
  const sizeClasses = $derived(size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-[11px]');

  async function pick(next: ProjectStatus, close: () => void) {
    close();
    if (next === status) return;
    await onChange?.(next);
  }
</script>

{#if onChange}
  <Popover bind:open label="Project status" panelRole="listbox">
    {#snippet trigger(attrs)}
      <button
        {...attrs}
        type="button"
        class="inline-flex items-center gap-1 rounded-full border {meta.border} {meta.bg} {meta.tone} {sizeClasses} font-medium hover:brightness-95"
      >
        <meta.icon size={size === 'md' ? 12 : 10} strokeWidth={2} />
        {meta.label}
        <ChevronDown size={size === 'md' ? 12 : 10} strokeWidth={2} class="opacity-60" />
      </button>
    {/snippet}

    {#snippet content({ close })}
      <div class="w-36">
        {#each STATUSES as s (s)}
          {@const m = META[s]}
          <button
            type="button"
            role="option"
            aria-selected={s === status}
            onclick={() => pick(s, close)}
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--color-bg)] {s ===
            status
              ? 'bg-[var(--color-bg)]'
              : ''}"
          >
            <m.icon size={12} strokeWidth={2} class={m.tone} />
            <span>{m.label}</span>
            {#if s === status}<span class="ml-auto text-[var(--color-subtle)]">✓</span>{/if}
          </button>
        {/each}
      </div>
    {/snippet}
  </Popover>
{:else}
  <span
    class="inline-flex items-center gap-1 rounded-full border {meta.border} {meta.bg} {meta.tone} {sizeClasses} font-medium"
  >
    <meta.icon size={size === 'md' ? 12 : 10} strokeWidth={2} />
    {meta.label}
  </span>
{/if}
