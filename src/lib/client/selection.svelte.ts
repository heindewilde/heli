/**
 * Page-local multi-select state for a list, the sibling of `listCache`.
 *
 * Deliberately a factory rather than a module-scope store, for the same reason
 * the list cache is: one instance per component, so SSR is leak-free and
 * `/people` and `/companies` cannot see each other's ticks.
 *
 * Backed by an array rather than a `Set`, because Svelte does not deep-proxy a
 * `Set` in `$state` — the contact-import triage screen has to write
 * `selected = new Set(selected)` after every mutation for exactly that reason.
 * An array reassignment is the same cost and reads as what it is. Membership
 * tests go through a `$derived` Set so `has()` stays O(1) in a 50-row render.
 */

export interface Selection {
  /** Ticked ids, in the order they were ticked. */
  readonly ids: string[];
  readonly size: number;
  has(id: string): boolean;
  toggle(id: string): void;
  /**
   * Shift-click: select everything between the last-touched row and this one,
   * in the list's current visual order.
   */
  rangeTo(id: string, ordered: string[]): void;
  /** All-or-none over the rows currently loaded. */
  toggleAll(visible: string[]): void;
  /** Drop ids that are no longer on the page. */
  prune(valid: string[]): void;
  clear(): void;
}

export function createSelection(): Selection {
  let ids = $state<string[]>([]);
  const lookup = $derived(new Set(ids));
  // The other end of a shift-click range. Not reactive: nothing renders it.
  let anchor: string | null = null;

  return {
    get ids() {
      return ids;
    },
    get size() {
      return ids.length;
    },
    has(id) {
      return lookup.has(id);
    },
    toggle(id) {
      anchor = id;
      ids = lookup.has(id) ? ids.filter((x) => x !== id) : [...ids, id];
    },
    rangeTo(id, ordered) {
      const to = ordered.indexOf(id);
      if (to === -1) return;
      // With no anchor yet, a shift-click is just a click — guessing "from the
      // top" would select rows the user never looked at.
      const from = anchor === null ? to : ordered.indexOf(anchor);
      if (from === -1) {
        this.toggle(id);
        return;
      }
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      const span = ordered.slice(lo, hi + 1).filter((x) => !lookup.has(x));
      anchor = id;
      // A range only ever adds. Shift-clicking across a mixed run and having it
      // deselect half of what you already had is the behaviour nobody predicts.
      if (span.length > 0) ids = [...ids, ...span];
    },
    toggleAll(visible) {
      const allTicked = visible.length > 0 && visible.every((x) => lookup.has(x));
      anchor = null;
      ids = allTicked ? ids.filter((x) => !visible.includes(x)) : [...new Set([...ids, ...visible])];
    },
    prune(valid) {
      const keep = new Set(valid);
      // Pruning rather than clearing: an action that ends in `invalidateAll()`
      // brings the same rows back, and losing the selection every time you
      // tagged something would make a second action impossible. A filter change
      // removes most ids, so the selection shrinks on its own.
      const next = ids.filter((x) => keep.has(x));
      if (next.length !== ids.length) ids = next;
      if (anchor !== null && !keep.has(anchor)) anchor = null;
    },
    clear() {
      anchor = null;
      if (ids.length > 0) ids = [];
    }
  };
}
