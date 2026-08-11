<script lang="ts">
  /**
   * Click a value, type, commit. The detail pages' editing primitive.
   *
   * Generalised out of FieldRow, which had three problems worth naming because
   * they are the ones this fixes:
   *
   *   1. It called `invalidateAll()` on every commit — a full SSR reload, eight
   *      to fifteen database round trips, to redisplay one string.
   *   2. It had no busy or error state. A failed PATCH toasted, but left the
   *      new value on screen as though it had saved.
   *   3. `onblur={commit}` raced Escape: Escape set `editing = false`, which
   *      blurred the input, which fired commit with the reverted draft. It was
   *      harmless by luck — the reverted draft equalled the current value, so
   *      the early-return caught it — but it was luck.
   *
   * The optimistic value is held locally and cleared whenever the prop changes,
   * so a later server render takes over cleanly without a flash.
   */
  import { Check, Loader2 } from 'lucide-svelte';
  import { autofocus } from '$lib/actions';

  type Props = {
    value: string | null;
    /** Return false to reject the edit and roll back. */
    onCommit: (next: string | null) => Promise<boolean> | boolean;
    placeholder?: string;
    /** Accessible name for the input. */
    label: string;
    multiline?: boolean;
    inputClass?: string;
    displayClass?: string;
    /**
     * Tab commits and opens the next Editable in the DOM, so filling out a
     * record is one keyboard pass instead of click-type-click-type. Opt-in:
     * elsewhere, Tab should do what Tab normally does.
     */
    tabToNext?: boolean;
    /** Rendered instead of the raw value when not editing. */
    display?: import('svelte').Snippet<[string | null]>;
  };

  let {
    value,
    onCommit,
    placeholder = '',
    label,
    multiline = false,
    inputClass = '',
    displayClass = '',
    tabToNext = false,
    display
  }: Props = $props();

  let editing = $state(false);
  let draft = $state('');
  let busy = $state(false);
  let cancelled = false;
  let root = $state<HTMLElement | undefined>(undefined);

  // Optimistic override. `undefined` means "defer to the prop".
  let override = $state<string | null | undefined>(undefined);
  const shown = $derived(override !== undefined ? override : value);

  // When the server catches up, drop the override rather than fighting it.
  $effect(() => {
    value;
    override = undefined;
  });

  function beginEdit() {
    draft = shown ?? '';
    cancelled = false;
    editing = true;
  }

  /** Hand focus to the next (or previous) Editable and open it. */
  function moveToSibling(back: boolean) {
    const all = [...document.querySelectorAll<HTMLElement>('[data-editable]')];
    const i = root ? all.indexOf(root) : -1;
    const next = all[i + (back ? -1 : 1)];
    if (!next) return;
    // Deferred: this Editable is still swapping its input back to a button, and
    // focusing during that teardown gets undone.
    requestAnimationFrame(() => next.querySelector('button')?.click());
  }

  function cancel() {
    // Set before blurring: the blur handler runs synchronously afterwards and
    // would otherwise commit the reverted draft.
    cancelled = true;
    editing = false;
  }

  async function commit() {
    if (cancelled || busy) return;
    const next = draft.trim() || null;
    editing = false;
    if (next === (shown ?? null)) return;

    const previous = override;
    override = next;
    busy = true;
    try {
      const ok = await onCommit(next);
      if (!ok) override = previous;
    } catch {
      override = previous;
    } finally {
      busy = false;
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (tabToNext && e.key === 'Tab') {
      e.preventDefault();
      commit();
      moveToSibling(e.shiftKey);
      return;
    }
    if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  }
</script>

<span bind:this={root} data-editable class="contents">
  {#if editing}
    {#if multiline}
      <textarea
        bind:value={draft}
        use:autofocus
        onblur={commit}
        onkeydown={onKeyDown}
        aria-label={label}
        rows="3"
        class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-border-strong)] {inputClass}"
      ></textarea>
    {:else}
      <input
        bind:value={draft}
        use:autofocus
        onblur={commit}
        onkeydown={onKeyDown}
        aria-label={label}
        class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-border-strong)] {inputClass}"
      />
    {/if}
  {:else}
    <button
      type="button"
      onclick={beginEdit}
      class="group/editable flex min-h-6 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] -mx-1 px-1 text-left text-sm hover:bg-[var(--color-surface)] {displayClass}"
    >
      {#if display}
        {@render display(shown)}
      {:else}
        <span class="truncate {shown ? '' : 'italic text-[var(--color-subtle)]'}"
          >{shown ?? placeholder}</span
        >
      {/if}
      {#if busy}
        <Loader2
          size={11}
          strokeWidth={2}
          class="shrink-0 animate-spin text-[var(--color-subtle)]"
        />
      {:else if override !== undefined}
        <!-- Saved, but the page has not re-rendered from the server. The tick
             is what tells the user the optimistic value is real. -->
        <Check size={11} strokeWidth={2.5} class="shrink-0 text-[var(--color-success)]" />
      {/if}
    </button>
  {/if}
</span>
