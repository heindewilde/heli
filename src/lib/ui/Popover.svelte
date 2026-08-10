<script lang="ts">
  /**
   * An anchored panel. The single implementation behind every menu, picker and
   * cell popover in the app.
   *
   * Two decisions worth knowing before you change it:
   *
   * `popover="manual"`, never `"auto"`. Auto light-dismiss closes the entire
   * popover stack on one press, which breaks the nested cases that already
   * exist here — the status picker's "create status" sub-view, and any menu
   * opened inside a dialog. Dismissal is owned by `layerStack`, which knows
   * what is on top.
   *
   * The trigger is a snippet, not a prop. Triggers in this app are a status
   * pill, a flag icon, a filter chip, an avatar and plain text; a primitive
   * that rendered them would need a prop per variant. Instead the snippet
   * receives the ARIA wiring as `attrs`, so accessibility is correct once
   * rather than at twelve call sites.
   */
  import type { Snippet } from 'svelte';
  import { anchored, type Placement } from './position';
  import { pushLayer } from './layerStack';
  import { trapFocus } from './trapFocus';

  export type TriggerAttrs = {
    id: string;
    'aria-haspopup': 'menu' | 'dialog' | 'listbox' | 'true';
    'aria-expanded': boolean;
    'aria-controls': string | undefined;
    onclick: (e: MouseEvent) => void;
  };

  type Props = {
    open?: boolean;
    placement?: Placement;
    /** Accessible name for the panel. */
    label: string;
    /**
     * ARIA role for the panel. Named `panelRole` rather than `role` on purpose:
     * `role="dialog"` at a call site should mean a hand-rolled modal surface,
     * and scripts/check-overlays.ts fails the build on exactly that string. A
     * prop spelled `role` would make every correct use of this primitive
     * indistinguishable from the thing the lint exists to catch.
     */
    panelRole?: 'menu' | 'dialog' | 'listbox';
    /** Match the panel's minimum width to the trigger's. */
    matchWidth?: boolean;
    /** Move focus into the panel on open. Off for comboboxes, which keep focus in their input. */
    autoFocus?: boolean;
    /** Extra classes on the panel. */
    panelClass?: string;
    /** Extra classes on the inline wrapper. */
    class?: string;
    /** Called after the panel closes, however it was closed. */
    onclose?: () => void;
    trigger: Snippet<[TriggerAttrs]>;
    content: Snippet<[{ close: () => void }]>;
  };

  let {
    open = $bindable(false),
    placement = 'bottom-start',
    label,
    panelRole = 'dialog',
    matchWidth = false,
    autoFocus = true,
    panelClass = '',
    class: className = '',
    onclose,
    trigger,
    content
  }: Props = $props();

  const uid = $props.id();
  const panelId = `popover-${uid}`;

  let wrapperEl = $state<HTMLElement | undefined>(undefined);
  let triggerHostEl = $state<HTMLElement | undefined>(undefined);
  let panelEl = $state<HTMLElement | undefined>(undefined);

  export function close() {
    if (!open) return;
    open = false;
    onclose?.();
    // Return focus to whatever the trigger snippet rendered, so a keyboard
    // user is not dropped back at the top of the document.
    triggerHostEl?.querySelector<HTMLElement>('button,[role="button"],a[href]')?.focus();
  }

  const attrs = $derived<TriggerAttrs>({
    id: `${panelId}-trigger`,
    'aria-haspopup': panelRole,
    'aria-expanded': open,
    'aria-controls': open ? panelId : undefined,
    onclick: (e: MouseEvent) => {
      // List rows are wrapped in <a href>. Without this, opening a cell
      // popover navigates away — the reason every hand-rolled trigger in this
      // codebase already called stopPropagation.
      e.stopPropagation();
      e.preventDefault();
      if (open) close();
      else open = true;
    }
  });

  // Promote to the browser's top layer where available. Everything already
  // works without it (the panel is position:fixed at computed coordinates);
  // this additionally makes it immune to ancestor overflow, transforms and
  // stacking contexts.
  $effect(() => {
    const el = panelEl;
    if (!el || !open) return;
    if (typeof el.showPopover !== 'function') return;
    try {
      if (!el.matches(':popover-open')) el.showPopover();
    } catch {
      // A detached or already-open element. Positioning still holds.
    }
  });

  $effect(() => {
    if (!open) return;
    const handle = pushLayer({
      // The panel is a DOM descendant of the wrapper even when rendered in the
      // top layer, so one containment check covers trigger and panel both —
      // which is what stops a press on the trigger from closing and instantly
      // reopening.
      contains: (t) => wrapperEl?.contains(t) ?? false,
      onDismiss: close
    });
    return () => handle.release();
  });
</script>

<span bind:this={wrapperEl} class="relative inline-flex min-w-0 max-w-full {className}">
  <span bind:this={triggerHostEl} class="contents">
    {@render trigger(attrs)}
  </span>

  {#if open}
    <div
      bind:this={panelEl}
      id={panelId}
      role={panelRole}
      aria-label={label}
      popover="manual"
      tabindex="-1"
      use:anchored={{ anchor: triggerHostEl, placement, matchWidth }}
      use:trapFocus={{ autoFocus }}
      class="z-[var(--z-popover)] overflow-auto overscroll-contain rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-text)] shadow-[var(--shadow-lg)] focus:outline-none {panelClass}"
    >
      {@render content({ close })}
    </div>
  {/if}
</span>

<!--
  No style reset for [popover] is needed. The UA sheet's inset/margin/border/
  padding/background all sit in the user-agent origin, so any author
  declaration beats them regardless of specificity: Tailwind's preflight zeroes
  margin/padding/border, the classes above set background and colour, and
  position.ts sets inset/margin/left/top inline. A scoped `[popover] { … }`
  block here would instead out-specify those Tailwind classes and blank the
  panel out.
-->
