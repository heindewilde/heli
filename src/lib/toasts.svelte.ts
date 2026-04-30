import { createId } from '@paralleldrive/cuid2';

export type ToastKind = 'info' | 'success' | 'warning' | 'danger';

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  undo?: () => void;
};

const toasts = $state<Toast[]>([]);

function dismiss(id: string) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i !== -1) toasts.splice(i, 1);
}

function push(message: string, opts?: { kind?: ToastKind; undo?: () => void; ttl?: number }) {
  const id = createId();
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
