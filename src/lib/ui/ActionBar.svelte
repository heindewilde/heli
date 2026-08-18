<script lang="ts">
  /**
   * The contextual bar that appears while rows are selected.
   *
   * Floating rather than inline in the filter row, because the filter row
   * scrolls away after about six rows and a list page renders fifty. An action
   * you have to scroll back up to reach is one nobody uses twice.
   *
   * It lives in `src/lib/ui/` specifically so the z-index is allowed here:
   * `check-overlays.ts` fails a numeric z-index anywhere else, and the token
   * this needs is `--z-sticky` — below popovers and dialogs, since the pickers
   * it opens must sit on top of it, and a confirm dialog on top of both.
   *
   * Not a Dialog: it takes no focus, traps nothing and dismisses nothing. It is
   * a toolbar that happens to float, so it carries `role="toolbar"` and stays
   * out of `layerStack` entirely — pressing Escape should clear the selection,
   * which is the page's business, not a layer's.
   */
  import { X } from 'lucide-svelte';
  import type { Snippet } from 'svelte';

  type Props = {
    /** Rendered as "N selected". Zero hides the bar. */
    count: number;
    /** Singular noun for the count. */
    noun?: string;
    /** Plural, when it is not `noun + 's'` — "companies", not "companys". */
    plural?: string;
    label?: string;
    onclear: () => void;
    children: Snippet;
  };

  let {
    count,
    noun = 'row',
    plural = undefined,
    label = 'Bulk actions',
    onclear,
    children
  }: Props = $props();

  const many = $derived(plural ?? `${noun}s`);
</script>

{#if count > 0}
  <div
    class="pointer-events-none fixed inset-x-0 bottom-4 z-[var(--z-sticky)] flex justify-center px-4 sm:bottom-6"
  >
    <div
      role="toolbar"
      aria-label={label}
      class="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 shadow-lg"
    >
      <span class="px-1.5 text-xs font-medium tabular-nums text-[var(--color-text)]">
        {count}
        {count === 1 ? noun : many} selected
      </span>
      <span class="h-4 w-px bg-[var(--color-border)]" aria-hidden="true"></span>

      {@render children()}

      <span class="h-4 w-px bg-[var(--color-border)]" aria-hidden="true"></span>
      <button
        type="button"
        onclick={onclear}
        class="inline-flex size-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:bg-[var(--color-row-hover)] hover:text-[var(--color-text)]"
        aria-label="Clear selection"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  </div>
{/if}
