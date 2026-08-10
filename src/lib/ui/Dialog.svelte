<script lang="ts">
  /**
   * The modal surface: command palette, shortcut sheet, auth modal, mobile
   * drawer. Five hand-rolled `fixed inset-0 z-50 bg-black/40` blocks became
   * this one.
   *
   * The backdrop carries no click handler. Outside-press dismissal comes from
   * `layerStack`, which already listens at the window — so there is no
   * interactive `<div>` to trip `a11y_no_static_element_interactions`, and no
   * `<button class="fixed inset-0">` adding a phantom tab stop either. Those
   * were the two workarounds this codebase used, one in each direction.
   */
  import type { Snippet } from 'svelte';
  import { pushLayer } from './layerStack';
  import { lockScroll } from './scrollLock';
  import { trapFocus } from './trapFocus';

  type Props = {
    open: boolean;
    /** Accessible name. Use `labelledBy` instead when a visible heading exists. */
    label?: string;
    labelledBy?: string;
    variant?: 'center' | 'top' | 'drawer';
    /** Extra classes on the panel. */
    panelClass?: string;
    /**
     * Replaces the default scrim classes. The auth modal uses a tinted,
     * blurred wash rather than a neutral dim.
     */
    backdropClass?: string;
    /**
     * Surface, border, radius and shadow on the panel. Off when the child
     * already renders its own card (again, the auth modal).
     */
    chrome?: boolean;
    onclose: () => void;
    children: Snippet<[{ close: () => void }]>;
  };

  let {
    open,
    label,
    labelledBy,
    variant = 'center',
    panelClass = '',
    backdropClass = 'bg-black/40',
    chrome = true,
    onclose,
    children
  }: Props = $props();

  let panelEl = $state<HTMLElement | undefined>(undefined);

  function close() {
    onclose();
  }

  $effect(() => {
    if (!open) return;
    const handle = pushLayer({
      contains: (t) => panelEl?.contains(t) ?? false,
      onDismiss: close
    });
    const unlock = lockScroll();
    return () => {
      handle.release();
      unlock();
    };
  });

  const wrapper = $derived(
    variant === 'drawer'
      ? 'items-stretch justify-start'
      : variant === 'top'
        ? 'items-start justify-center overflow-y-auto px-4 pt-[5vh] sm:pt-[12vh]'
        : // `overflow-y-auto` plus `m-auto` on the panel (below) rather than
          // `items-center` alone: a form taller than the viewport would
          // otherwise have its top clipped with no way to scroll to it.
          'items-center justify-center overflow-y-auto p-4'
  );

  const panelBase = $derived.by(() => {
    if (variant === 'drawer') {
      return `h-full w-64 max-w-[85vw] ${chrome ? 'border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]' : ''}`;
    }
    return `m-auto w-full max-w-lg ${chrome ? 'overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]' : ''}`;
  });
</script>

{#if open}
  <div class="fixed inset-0 z-[var(--z-dialog)] flex {wrapper}">
    <!-- Inert on purpose: dismissal is layerStack's job. -->
    <div class="absolute inset-0 {backdropClass}" aria-hidden="true"></div>
    <div
      bind:this={panelEl}
      role="dialog"
      aria-modal="true"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      tabindex="-1"
      use:trapFocus
      class="relative {panelBase} focus:outline-none {panelClass}"
    >
      {@render children({ close })}
    </div>
  </div>
{/if}
