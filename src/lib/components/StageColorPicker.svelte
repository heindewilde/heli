<script lang="ts">
  /**
   * The stage colour swatch and its palette popover.
   *
   * Extracted because four call sites (two in StageEditor, two in
   * /pipelines/new) each tracked an `openPicker` id keyed by stage, and Popover
   * owns a bindable `open` per instance. Same reasoning as PipelineStageChip.
   */
  import { STAGE_COLORS, STAGE_COLOR_SWATCH, type StageColor } from '$lib/stageColors';
  import Popover from '$lib/ui/Popover.svelte';

  type Props = {
    value: StageColor;
    onChange: (next: StageColor) => void;
    label?: string;
  };

  let { value, onChange, label = 'Change stage color' }: Props = $props();

  let open = $state(false);
</script>

<Popover bind:open {label} panelRole="listbox" placement="top-end">
  {#snippet trigger(attrs)}
    <button
      {...attrs}
      type="button"
      aria-label={label}
      class="h-4 w-4 rounded-full ring-offset-1 hover:ring-2 hover:ring-[var(--color-border)]"
      style="background-color:{STAGE_COLOR_SWATCH[value]}"
    ></button>
  {/snippet}

  {#snippet content({ close })}
    <div class="flex gap-1 p-1.5">
      {#each STAGE_COLORS as c (c)}
        <button
          type="button"
          role="option"
          aria-selected={value === c}
          onclick={() => {
            onChange(c);
            close();
          }}
          title={c}
          class="h-4 w-4 rounded-full ring-offset-1 transition-transform hover:scale-110 {value === c
            ? 'ring-2 ring-[var(--color-text)]'
            : ''}"
          style="background-color:{STAGE_COLOR_SWATCH[c]}"
        ></button>
      {/each}
    </div>
  {/snippet}
</Popover>
