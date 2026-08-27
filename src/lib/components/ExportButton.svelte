<script lang="ts">
  /**
   * Export, with a preview of what is about to leave.
   *
   * The trigger says only "Export" — the *panel* is what names the scope, so a
   * narrowed view cannot hand over half a list without saying so first. That is
   * the same job the old "Export filtered" label did, done properly: it can
   * show the count and the filters rather than one adjective.
   *
   * The download itself is still a plain `<a href>` inside the panel, so it
   * keeps `data-sveltekit-reload` — `/api/export` has no `+page`, and without
   * that attribute the client router turns the click into a thrown "Not found"
   * with no download, in the built app only.
   */
  import { Download, Loader2 } from 'lucide-svelte';
  import Popover from '$lib/ui/Popover.svelte';

  type Props = {
    /** The CSV URL. Also what the panel's Download button points at. */
    href: string;
    /**
     * Lines describing the scope — active filters, or a kind breakdown. Shown
     * verbatim under the count.
     */
    detail?: string[];
    /**
     * A JSON endpoint returning `{ count }` for the same query. Omit when the
     * caller already knows the number (a collection's members are on the page,
     * a selection is whatever was ticked).
     */
    countHref?: string;
    /** Known up front; skips the fetch. */
    count?: number;
    /** Singular/plural for the count line. */
    noun?: [string, string];
    size?: 'sm' | 'md';
  };

  let {
    href,
    detail = [],
    countHref,
    count,
    noun = ['record', 'records'],
    size = 'md'
  }: Props = $props();

  let open = $state(false);
  let fetched = $state<number | null>(null);
  let busy = $state(false);
  let failed = $state(false);

  /**
   * Counted on open, not on mount: this is one query per click of a button most
   * people never press, and it must reflect the filters as they are *now*.
   */
  $effect(() => {
    if (!open || !countHref || count !== undefined) return;
    const target = countHref;
    fetched = null;
    failed = false;
    busy = true;
    fetch(target)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d: { count: number }) => {
        // The panel may have been closed and reopened against a different
        // filter while this was in flight.
        if (countHref === target) fetched = d.count;
      })
      .catch(() => {
        if (countHref === target) failed = true;
      })
      .finally(() => {
        if (countHref === target) busy = false;
      });
  });

  const shown = $derived(count ?? fetched);
  const triggerClass = $derived(
    size === 'sm'
      ? 'inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]'
      : 'inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 text-sm text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]'
  );
</script>

<Popover bind:open label="Export" panelRole="dialog">
  {#snippet trigger(attrs)}
    <button {...attrs} type="button" class={triggerClass}>
      <Download size={size === 'sm' ? 13 : 14} strokeWidth={2} />
      Export
    </button>
  {/snippet}
  {#snippet content({ close })}
    <!--
      Sized against the h-7 / text-xs triggers it hangs off, not against a
      dialog. The count *is* the heading — a "People" label above "8 people" on
      the people page is a word that tells you nothing you did not already know.
    -->
    <div class="flex w-52 flex-col gap-2 p-2.5">
      <div class="flex flex-col gap-0.5">
        <p class="text-[13px] font-medium text-[var(--color-text)]">
          {#if busy}
            <span class="inline-flex items-center gap-1 text-[var(--color-muted)]">
              <Loader2 size={12} strokeWidth={2} class="animate-spin" /> Counting…
            </span>
          {:else if failed}
            <span class="text-[var(--color-muted)]">Ready to download</span>
          {:else if shown !== null && shown !== undefined}
            <!-- One interpolation, not two: separate expressions put a newline
                 between the number and its noun. -->
            {`${shown} ${shown === 1 ? noun[0] : noun[1]}`}
          {/if}
        </p>
        {#each detail as line (line)}
          <p class="text-[11px] leading-snug text-[var(--color-subtle)]">{line}</p>
        {/each}
        {#if shown === 0}
          <p class="text-[11px] leading-snug text-[var(--color-subtle)]">
            The file would have only its header row.
          </p>
        {/if}
      </div>

      <a
        data-sveltekit-reload
        {href}
        onclick={close}
        class="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-accent)] text-xs font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)]"
      >
        <Download size={13} strokeWidth={2} />
        Download CSV
      </a>
    </div>
  {/snippet}
</Popover>
