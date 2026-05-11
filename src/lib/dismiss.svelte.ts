import type { Action } from 'svelte/action';

// Svelte action: call `onClose` when a mousedown lands outside `node`, or
// when the user presses Escape. Replaces the inert `<button class="fixed
// inset-0">` scrim pattern — same behavior, no extra DOM node in the tab
// order, matches the pre-existing convention used by RowTagAdder/StatusChip.
//
// Pass `null` to disable temporarily (useful while a popover isn't open).
export const dismiss: Action<HTMLElement, (() => void) | null> = (node, onClose) => {
  let close = onClose;

  function onMouseDown(e: MouseEvent) {
    if (!close) return;
    const t = e.target as Node | null;
    if (t && node.contains(t)) return;
    close();
  }
  function onKey(e: KeyboardEvent) {
    if (!close) return;
    if (e.key === 'Escape') close();
  }

  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('keydown', onKey);

  return {
    update(next) {
      close = next;
    },
    destroy() {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    }
  };
};
