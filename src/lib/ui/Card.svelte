<script lang="ts">
  /**
   * The card surface, named once.
   *
   * `border-[var(--color-border)] bg-[var(--color-surface)]` appeared twelve
   * times in `people/+page.svelte` alone, ten more in settings, nine in each
   * detail page — and it had already drifted into three incompatible recipes:
   * the dashboard cards used `--radius-md` with no shadow, the grid cards used
   * `--radius-lg` with `hover:shadow-sm` (the *stock* Tailwind shadow, not the
   * token), and the board cards used `--radius-md` over `--color-bg`.
   *
   * The anatomy mirrors the reference: an optional title strip, an optional
   * tinted subheader beneath it, then the body. That second row is what makes a
   * card look composed rather than like a div with a border — it gives a
   * section somewhere to put "Active users by platform" that is neither a
   * heading nor body content.
   *
   * `heading` renders the title as an element with the shared section-heading
   * style, so the inconsistency between the detail pages (uppercase-subtle on
   * people/companies, `text-sm` muted on projects) resolves here rather than
   * being re-litigated per page.
   */
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type Elevation = 'flat' | 'raised' | 'panel';

  type Props = HTMLAttributes<HTMLDivElement> & {
    /** Plain-text title for the header strip. Omit and pass `header` for markup. */
    title?: string;
    /** Heading level for `title`. Cards inside a page section usually want h3. */
    headingLevel?: 2 | 3 | 4;
    elevation?: Elevation;
    /** Tighter padding for dense contexts (board columns, sidebars). */
    compact?: boolean;
    /** Right-aligned content in the header strip — a count, a link, an action. */
    actions?: Snippet;
    /** Full control of the header strip; wins over `title`. */
    header?: Snippet;
    /** Tinted strip beneath the header. */
    subheader?: Snippet;
    /** Body without the default padding — for a card that hosts a list/table. */
    flush?: boolean;
    children: Snippet;
  };

  let {
    title,
    headingLevel = 3,
    elevation = 'flat',
    compact = false,
    flush = false,
    actions,
    header,
    subheader,
    class: className = '',
    children,
    ...rest
  }: Props = $props();

  const ELEVATIONS: Record<Elevation, string> = {
    flat: 'border-[var(--color-border)]',
    raised: 'border-[var(--color-border)] shadow-raised',
    panel: 'border-transparent shadow-panel'
  };

  const pad = $derived(compact ? 'px-3 py-2.5' : 'px-4 py-3');
  const hasHead = $derived(!!header || !!title || !!actions);
</script>

<div
  class="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--color-surface)] {ELEVATIONS[
    elevation
  ]} {className}"
  {...rest}
>
  {#if hasHead}
    <div class="flex items-center justify-between gap-3 {pad} {subheader ? '' : 'pb-2'}">
      {#if header}
        {@render header()}
      {:else if title}
        <svelte:element
          this={`h${headingLevel}`}
          class="min-w-0 truncate text-sm font-semibold text-[var(--color-text)]"
        >
          {title}
        </svelte:element>
      {:else}
        <span></span>
      {/if}
      {#if actions}
        <div class="flex shrink-0 items-center gap-1">{@render actions()}</div>
      {/if}
    </div>
  {/if}

  {#if subheader}
    <div
      class="border-y border-[var(--color-border)] bg-[var(--color-surface-2)] {compact
        ? 'px-3 py-1.5'
        : 'px-4 py-2'} text-xs font-medium text-[var(--color-muted)]"
    >
      {@render subheader()}
    </div>
  {/if}

  <div class="min-w-0 flex-1 {flush ? '' : `${pad} ${hasHead && !subheader ? 'pt-0' : ''}`}">
    {@render children()}
  </div>
</div>
