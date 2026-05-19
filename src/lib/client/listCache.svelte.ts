// Page-local reactive list cache. Holds an array of rows and exposes
// patch / insert / remove primitives that apply synchronously and return a
// rollback function — the optimistic-UI pattern, hand-rolled with Svelte 5
// runes so no new dependency is needed.
//
// Usage in a +page.svelte:
//
//   const cache = createListCache(data.items);
//   $effect(() => cache.hydrate(data.items));    // re-sync after SvelteKit invalidation
//   const rows = $derived(cache.items);
//
//   async function patch(id, body) {
//     const rollback = cache.patch(id, body);
//     try {
//       const res = await fetch(`/api/people/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
//       if (!res.ok) { rollback(); toast.danger('Update failed'); }
//     } catch { rollback(); toast.danger('Update failed'); }
//   }
//
// The cache is local to whichever component creates it — no module-scope
// registry, so SSR is leak-free and components can't accidentally share
// state across routes.

export interface ListCache<T extends { id: string }> {
  readonly items: T[];
  hydrate(next: T[]): void;
  patch(id: string, updates: Partial<T>): () => void;
  insert(item: T, position?: 'start' | 'end'): () => void;
  remove(id: string): () => void;
}

export function createListCache<T extends { id: string }>(initial: T[]): ListCache<T> {
  let items = $state<T[]>([...initial]);

  return {
    get items() {
      return items;
    },
    hydrate(next) {
      items = [...next];
    },
    patch(id, updates) {
      const idx = items.findIndex((x) => x.id === id);
      if (idx === -1) return () => {};
      const prev = items[idx];
      items = items.map((x) => (x.id === id ? { ...x, ...updates } : x));
      return () => {
        items = items.map((x) => (x.id === id ? prev : x));
      };
    },
    insert(item, position = 'start') {
      items = position === 'start' ? [item, ...items] : [...items, item];
      return () => {
        items = items.filter((x) => x.id !== item.id);
      };
    },
    remove(id) {
      const idx = items.findIndex((x) => x.id === id);
      if (idx === -1) return () => {};
      const prev = items[idx];
      items = items.filter((x) => x.id !== id);
      return () => {
        const before = items.slice(0, idx);
        const after = items.slice(idx);
        items = [...before, prev, ...after];
      };
    }
  };
}
