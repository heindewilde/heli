/**
 * Shared key-handling helper.
 *
 * `bindKeys` used to live here and was the app's shortcut mechanism. It is
 * gone: it returned early on *any* modifier, so ⌘K could not be expressed
 * through it and needed a separate listener, and every page that wanted keys
 * added another window listener of its own. `src/lib/commands/registry.svelte.ts`
 * replaced it with one dispatcher that models modifiers and sequences.
 *
 * This guard survives because the registry — and anything else deciding
 * whether a keystroke belongs to the page or to the person typing — still
 * needs it.
 */

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}
