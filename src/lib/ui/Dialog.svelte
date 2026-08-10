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
    onclose: () => void;
    children: Snippet<[{ close: () => void }]>;
  };

  let {
    open,
    label,
    labelledBy,
    variant = 'center',
    panelClass = '',
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
        ? 'items-start justify-center pt-[12vh]'
        : 'items-center justify-center p-4'
  );

  const panelBase = $derived(
    variant === 'drawer'
      ? 'h-full w-64 max-w-[85vw] border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]'
      : 'w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]'
  );
</script>

{#if open}
  <div class="fixed inset-0 z-[var(--z-dialog)] flex {wrapper}">
    <!-- Inert on purpose: dismissal is layerStack's job. -->
    <div class="absolute inset-0 bg-black/40" aria-hidden="true"></div>
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
