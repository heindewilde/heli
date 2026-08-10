/**
 * Focus containment and restore for modal surfaces.
 *
 * Note the interaction with `app.css`'s global `*:focus-visible` outline: focus
 * the first focusable *child*, never a `tabindex="-1"` wrapper, or the ring
 * paints a frame around the whole dialog.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

export type TrapOptions = {
  /** Skip the initial focus move — for a combobox whose input is already focused. */
  autoFocus?: boolean;
};

export function trapFocus(node: HTMLElement, options: TrapOptions = {}) {
  const previous = document.activeElement as HTMLElement | null;

  if (options.autoFocus !== false) {
    // Deferred: children mount before the browser has laid them out, and
    // focusing an element with zero boxes is a no-op.
    requestAnimationFrame(() => {
      const items = focusable(node);
      if (items.length > 0) items[0].focus();
    });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const items = focusable(node);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && (active === first || !node.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !node.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  node.addEventListener('keydown', onKeyDown);

  return {
    destroy() {
      node.removeEventListener('keydown', onKeyDown);
      // Only steal focus back if it is still inside the surface being torn
      // down. If the user has already clicked elsewhere, leave them alone.
      if (previous?.isConnected && (document.activeElement === document.body || node.contains(document.activeElement))) {
        previous.focus();
      }
    }
  };
}
