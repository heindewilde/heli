<script lang="ts">
  /**
   * The app had 42 native `title=""` attributes and no tooltip. Native titles
   * are ~500ms late, unstyleable, truncated by some platforms, and — the part
   * that matters — invisible on touch and inconsistently announced by screen
   * readers. Every icon-only button in the topbar and every hover action in the
   * lists depended on one.
   *
   * Notes on the parts that are easy to get wrong:
   *
   * - **Focus shows it immediately, hover waits.** A keyboard user asked for it;
   *   a pointer crossing the toolbar did not. The shared `recentlyShown` window
   *   is why moving along a row of icon buttons doesn't re-wait each time — the
   *   standard behaviour everywhere, and jarring by its absence.
   * - **Escape dismisses, and the listener is on the trigger, not the window.**
   *   WCAG 1.4.13 requires it, but `layerStack` owns the global Escape key and
   *   `src/lib/dismiss.svelte.ts` was deleted for adding a competing one. This
   *   handler is element-scoped and doesn't stop propagation, so it cannot
   *   fight the stack.
   * - **`aria-describedby`, not `aria-label`.** A tooltip supplements the
   *   accessible name; it doesn't replace it. An icon-only button still needs
   *   its own label, so `label` here is a description of what the control does.
   * - **`pointer-events: none`.** These are short strings, never interactive.
   *   Hoverable tooltip content would need a safe-triangle and a dismiss path;
   *   nothing in this app needs one.
   * - **Touch never shows it.** `pointerType === 'touch'` bails, because
   *   otherwise the tooltip appears on tap and sits over what you just pressed.
   *   That is no worse than `title=`, which never showed on touch either.
   */
  import type { Snippet } from 'svelte';
  import { anchored, type Placement } from './position';

  type TriggerAttrs = {
    'aria-describedby': string | undefined;
    onpointerenter: (e: PointerEvent) => void;
    onpointerleave: () => void;
    onfocusin: () => void;
    onfocusout: () => void;
    onkeydown: (e: KeyboardEvent) => void;
  };

  type Props = {
    /** The description. Keep it to a phrase — this is not a popover. */
    label: string;
    placement?: Placement;
    /** Hover dwell before showing, in ms. */
    delay?: number;
    disabled?: boolean;
    trigger: Snippet<[TriggerAttrs]>;
  };

  let { label, placement = 'bottom', delay = 400, disabled = false, trigger }: Props = $props();

  let open = $state(false);
  let wrapEl = $state<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * The wrapper is `display: contents` so it adds no box of its own — which
   * also means it *has* no box, and `getBoundingClientRect()` on it returns
   * zeros. Anchor to the trigger the caller rendered instead.
   */
  const anchorEl = $derived((wrapEl?.firstElementChild as HTMLElement | null) ?? wrapEl);

  const id = $props.id();

  /**
   * Module-scope on purpose: once one tooltip has been shown, the next few skip
   * their dwell. Shared across every instance, which is the point — it makes a
   * toolbar feel like a toolbar rather than like 6 independent controls.
   */
  let warm = false;
  let warmTimer: ReturnType<typeof setTimeout> | null = null;

  function show(immediate: boolean) {
    if (disabled || !label) return;
    if (timer) clearTimeout(timer);
    if (immediate || warm) {
      open = true;
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      open = true;
    }, delay);
  }

  function hide() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (open) {
      warm = true;
      if (warmTimer) clearTimeout(warmTimer);
      warmTimer = setTimeout(() => {
        warm = false;
      }, 1200);
    }
    open = false;
  }

  const attrs: TriggerAttrs = $derived({
    'aria-describedby': open ? id : undefined,
    onpointerenter: (e: PointerEvent) => {
      if (e.pointerType !== 'touch') show(false);
    },
    onpointerleave: hide,
    onfocusin: () => show(true),
    onfocusout: hide,
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) hide();
    }
  });
</script>

<span class="contents" bind:this={wrapEl}>
  {@render trigger(attrs)}
</span>

{#if open}
  <div
    {id}
    role="tooltip"
    class="tooltip pointer-events-none z-[var(--z-popover)] max-w-56 rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2 py-1 text-2xs font-medium text-[var(--color-accent-fg)] shadow-overlay"
    use:anchored={{ anchor: anchorEl ?? undefined, placement, offset: 6 }}
  >
    {label}
  </div>
{/if}

<style>
  .tooltip {
    animation: tooltip-in var(--duration-fast) var(--ease-out);
  }
  @keyframes tooltip-in {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
  }
</style>
