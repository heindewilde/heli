<script lang="ts">
  /**
   * The one spinner. There were twelve hand-written
   * `<Loader2 size={12} class="animate-spin …" />`, each picking its own size
   * and colour, and a couple that forgot the colour entirely and span in body
   * black against a muted row.
   *
   * `label` is not decoration: a bare spinning icon announces nothing, so the
   * default gives assistive tech something to say and `aria-live` is left to
   * the caller — a spinner inside a button that already says "Saving…" should
   * pass `label={null}` rather than duplicate it.
   */
  import { LoaderCircle } from 'lucide-svelte';

  type Size = 'xs' | 'sm' | 'md';

  type Props = {
    size?: Size;
    /** Accessible name. `null` when an adjacent element already says it. */
    label?: string | null;
    class?: string;
  };

  let { size = 'sm', label = 'Loading', class: className = '' }: Props = $props();

  const PX: Record<Size, number> = { xs: 12, sm: 14, md: 18 };
</script>

<LoaderCircle
  size={PX[size]}
  strokeWidth={2.25}
  class="shrink-0 animate-spin text-[var(--color-subtle)] {className}"
  aria-hidden={label === null}
  aria-label={label ?? undefined}
  role={label === null ? undefined : 'img'}
/>
