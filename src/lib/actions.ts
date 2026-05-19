// Small DOM-side actions reused across the app. Keep this file dependency-free —
// these run client-only after mount.

// Programmatic equivalent of the `autofocus` attribute. Svelte's a11y linter
// flags `autofocus` because it can disorient screen-reader users; an explicit
// action makes the intent visible at the call-site and lets us decide per
// component (e.g. only after the modal animates in).
export function autofocus(el: HTMLElement): void {
  el.focus();
}

// Fire `callback` when the element scrolls into view (within `rootMargin`).
// The callback may fire multiple times across mount/scroll cycles — the
// caller is expected to guard concurrent invocations (e.g. a loading flag).
// Falls back to a no-op when IntersectionObserver isn't available.
export function onIntersect(
  el: HTMLElement,
  callback: () => void
): { destroy(): void } | void {
  if (typeof IntersectionObserver === 'undefined') return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) callback();
    },
    { rootMargin: '200px' }
  );
  observer.observe(el);
  return {
    destroy() {
      observer.disconnect();
    }
  };
}
