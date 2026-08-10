/**
 * Refcounted body scroll lock.
 *
 * Two call sites used to set `document.body.style.overflow` independently — the
 * auth modal and the mobile drawer. Opening the drawer and then a dialog, and
 * closing the dialog, restored scrolling while the drawer was still open. A
 * counter plus one saved original value fixes that for every overlay at once.
 */

let depth = 0;
let saved = '';

export function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (depth === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  depth++;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth--;
    if (depth === 0) document.body.style.overflow = saved;
  };
}
