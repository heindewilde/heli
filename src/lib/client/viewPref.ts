/**
 * A remembered view toggle — list vs cards — in localStorage.
 *
 * **Never read this during component initialization.** The server has no way to
 * know the stored answer, so a first client render that picks a different
 * branch than the SSR'd HTML is a hydration mismatch — the same hazard that
 * keeps `Select.svelte` from detecting the pointer type at mount. Render the
 * default on the server, read the preference in `onMount`, and let it swap the
 * view in afterwards.
 *
 * Keys are caller-supplied and include the workspace id, so switching workspace
 * does not carry a preference across a tenant boundary.
 */

/** The stored value, or `null` when absent, unreadable or not in `allowed`. */
export function readViewPref<T extends string>(key: string, allowed: readonly T[]): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : null;
  } catch {
    // Private mode, disabled storage, quota. A display preference is a
    // convenience, never a requirement.
    return null;
  }
}

export function writeViewPref(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}
