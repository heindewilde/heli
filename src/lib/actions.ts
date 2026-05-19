// Small DOM-side actions reused across the app. Keep this file dependency-free —
// these run client-only after mount.

// Programmatic equivalent of the `autofocus` attribute. Svelte's a11y linter
// flags `autofocus` because it can disorient screen-reader users; an explicit
// action makes the intent visible at the call-site and lets us decide per
// component (e.g. only after the modal animates in).
export function autofocus(el: HTMLElement): void {
  el.focus();
}
