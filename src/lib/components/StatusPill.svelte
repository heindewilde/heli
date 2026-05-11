<script lang="ts">
  import { TONE_STYLES, type StatusRow } from '$lib/statuses';

  // Read-only inline pill. The clickable cell wrapper is StatusCell.svelte.
  // We split them so this pill can also be reused on detail pages, rows,
  // etc. without the click-to-edit affordance.

  type Props = { status: StatusRow | null; muted?: boolean };
  let { status, muted = false }: Props = $props();

  // When nothing is set, render an empty span — the row's status cell is
  // *invisible* by design until the user assigns one. The clickable wrapper
  // provides hover feedback so users can still discover the affordance.
</script>

{#if status}
  {@const s = TONE_STYLES[status.tone]}
  <span
    class="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium"
    style="background: {s.bg}; border-color: {s.border}; color: {muted ? 'var(--color-muted)' : s.text}"
  >
    <span class="h-1.5 w-1.5 shrink-0 rounded-full" style="background: {s.dot}"></span>
    <span class="truncate">{status.name}</span>
  </span>
{/if}
