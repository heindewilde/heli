<script lang="ts">
  /**
   * The "which stage is this in" chip, with its stage-picker popover.
   *
   * Extracted out of PipelinesCard because that card rendered one popover per
   * row while tracking a single `stagePopoverFor` id for all of them. Popover
   * owns a bindable `open`, and there is no clean way to bind one piece of
   * state to N popovers — so each row now owns its own.
   */
  import { ChevronDown } from 'lucide-svelte';
  import Popover from '$lib/ui/Popover.svelte';

  type Stage = { id: string; name: string; kind: string };

  type Props = {
    stageId: string;
    stageName: string;
    stageKind: string;
    stages: Stage[];
    onMove: (toStageId: string) => void;
  };

  let { stageId, stageName, stageKind, stages, onMove }: Props = $props();

  let open = $state(false);

  function dotClass(kind: string): string {
    if (kind === 'won') return 'bg-emerald-500';
    if (kind === 'lost') return 'bg-rose-500';
    return 'bg-[var(--color-accent)]';
  }

  function chipClass(kind: string): string {
    if (kind === 'won')
      return 'border-emerald-300/40 bg-emerald-300/15 text-emerald-700 dark:text-emerald-300';
    if (kind === 'lost')
      return 'border-rose-300/40 bg-rose-300/15 text-rose-700 dark:text-rose-300';
    return 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]';
  }
</script>

<Popover bind:open label="Move to stage" panelRole="listbox">
  {#snippet trigger(attrs)}
    <button
      {...attrs}
      type="button"
      class="inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] {chipClass(
        stageKind
      )} hover:opacity-90"
    >
      <span>{stageName}</span>
      <ChevronDown size={9} strokeWidth={2.5} />
    </button>
  {/snippet}

  {#snippet content({ close })}
    <div class="min-w-[160px] p-1">
      {#each stages as s (s.id)}
        <button
          type="button"
          role="option"
          aria-selected={s.id === stageId}
          onclick={() => {
            close();
            if (s.id !== stageId) onMove(s.id);
          }}
          class="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs hover:bg-[var(--color-bg)] {s.id ===
          stageId
            ? 'bg-[var(--color-bg)] font-medium'
            : ''}"
        >
          <span class="inline-block h-1.5 w-1.5 rounded-full {dotClass(s.kind)}"></span>
          <span class="min-w-0 flex-1 truncate">{s.name}</span>
          {#if s.id === stageId}
            <span class="text-[10px] text-[var(--color-subtle)]">current</span>
          {/if}
        </button>
      {/each}
      {#if stages.length === 0}
        <p class="px-2 py-1.5 text-xs italic text-[var(--color-subtle)]">Loading stages…</p>
      {/if}
    </div>
  {/snippet}
</Popover>
