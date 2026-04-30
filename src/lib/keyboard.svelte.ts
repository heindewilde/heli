/**
 * Global key handling helpers. Used by list pages for j/k/enter/e/#/*
 * and the layout for `/` (focus search) etc.
 *
 * Returns a list of (cleanup) functions you should call on component teardown.
 */

export type KeyHandler = (e: KeyboardEvent) => void | boolean;

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

export function bindKeys(handler: KeyHandler): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(e.target)) {
      // Allow `/` to focus search even while typing? Not for now — only outside inputs.
      return;
    }
    const result = handler(e);
    if (result === true) {
      e.preventDefault();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
