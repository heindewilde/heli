export type ToastKind = 'info' | 'success' | 'warning' | 'danger';

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  undo?: () => void;
};

const toasts = $state<Toast[]>([]);

/**
 * A counter, not a hash, and not `crypto.randomUUID()` either.
 *
 * This id never leaves the tab — it keys an `{#each}` and matches a dismissal
 * back to its entry. The cuid generator cost every page in the app 25 KB raw /
 * 11 KB gzipped of `@noble/hashes` SHA-512, because `Toaster` is mounted
 * unconditionally in the root layout and so made it a static dependency of
 * the app shell.
 *
 * `crypto.randomUUID()` would be free of that but is secure-context-only, and
 * this app deliberately runs over plain HTTP on a LAN self-host — the same
 * constraint `src/lib/client/clipboard.ts` exists for. A counter has no edge.
 */
let nextToastId = 0;

function dismiss(id: string) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i !== -1) toasts.splice(i, 1);
}

function push(message: string, opts?: { kind?: ToastKind; undo?: () => void; ttl?: number }) {
  const id = String(++nextToastId);
  const kind = opts?.kind ?? 'info';
  const ttl = opts?.ttl ?? (opts?.undo ? 5500 : 3500);
  toasts.push({ id, kind, message, undo: opts?.undo });
  setTimeout(() => dismiss(id), ttl);
  return id;
}

export const toast = {
  get items() {
    return toasts;
  },
  push,
  info: (m: string, o?: Parameters<typeof push>[1]) => push(m, { ...o, kind: 'info' }),
  success: (m: string, o?: Parameters<typeof push>[1]) => push(m, { ...o, kind: 'success' }),
  warning: (m: string, o?: Parameters<typeof push>[1]) => push(m, { ...o, kind: 'warning' }),
  danger: (m: string, o?: Parameters<typeof push>[1]) => push(m, { ...o, kind: 'danger' }),
  dismiss
};
