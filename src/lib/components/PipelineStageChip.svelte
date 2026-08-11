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
  import Badge from '$lib/ui/Badge.svelte';
  import MenuItem from '$lib/ui/MenuItem.svelte';

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

  /**
   * These were the last three raw Tailwind palette colours in the product
   * (`emerald-300/40`, `rose-300/40`) and the last three `dark:` utilities —
   * which, until `@custom-variant dark` was added, compiled against the OS
   * preference rather than the app's theme toggle, so a won chip rendered its
   * dark text on a light surface for anyone whose two settings disagreed.
   * Both problems disappear by going through the semantic tokens.
   */
  function toneFor(kind: string): 'success' | 'danger' | 'neutral' {
    if (kind === 'won') return 'success';
    if (kind === 'lost') return 'danger';
    return 'neutral';
  }

  function dotClass(kind: string): string {
    if (kind === 'won') return 'bg-[var(--color-success)]';
    if (kind === 'lost') return 'bg-[var(--color-danger)]';
    return 'bg-[var(--color-accent)]';
  }
</script>

<Popover bind:open label="Move to stage" panelRole="listbox">
  {#snippet trigger(attrs)}
    <button {...attrs} type="button" class="max-w-full transition-opacity hover:opacity-80">
      <Badge tone={toneFor(stageKind)} dot>
        <span class="inline-flex items-center gap-1">
          {stageName}
          <ChevronDown size={9} strokeWidth={2.5} class="shrink-0 opacity-70" />
        </span>
      </Badge>
    </button>
  {/snippet}

  {#snippet content({ close })}
    <div class="min-w-[160px] p-1">
      {#each stages as s (s.id)}
        <MenuItem
          selected={s.id === stageId}
          onclick={() => {
            close();
            if (s.id !== stageId) onMove(s.id);
          }}
        >
          {#snippet icon()}
            <span class="size-1.5 rounded-full {dotClass(s.kind)}"></span>
          {/snippet}
          {s.name}
        </MenuItem>
      {/each}
      {#if stages.length === 0}
        <p class="px-2 py-1.5 text-xs italic text-[var(--color-subtle)]">Loading stages…</p>
      {/if}
    </div>
  {/snippet}
</Popover>
