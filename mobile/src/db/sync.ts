import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { request, ApiError } from '../api/client';
import { loadCredential } from '../api/credentials';
import * as cache from './cache';
import { enqueue, flush, pendingCount } from './outbox';

/**
 * The seam between the network and the mirror.
 *
 * Screens call `useRows`, which reads SQLite and re-reads whenever the change
 * bus fires. Fetching is a separate concern that *writes* to SQLite; it is
 * never something a screen awaits before it can render. That is the whole
 * reason a cold start offline shows real content instead of a spinner.
 */

/* ── reading ─────────────────────────────────────────────────────────────── */

/**
 * Subscribe to a table and re-run a query when it changes.
 *
 * `useSyncExternalStore` is the right primitive but not directly usable here —
 * SQLite reads are async and it demands a synchronous snapshot — so the store
 * exposes a version counter and the query result is held in state beside it.
 */
export function useRows<T>(
  table: string,
  query: () => Promise<T>,
  deps: unknown[] = []
): { rows: T | null; loading: boolean; reload: () => void } {
  const [rows, setRows] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const version = useSyncExternalStore(
    (cb) => cache.subscribe(table, cb),
    () => versions.get(table) ?? 0
  );

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(() => {
    query()
      .then((r) => {
        if (alive.current) {
          setRows(r);
          setLoading(false);
        }
      })
      .catch(() => alive.current && setLoading(false));
    // `query` is a fresh closure each render; deps are the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run, version]);

  return { rows, loading, reload: run };
}

// Mirrors the change bus so useSyncExternalStore has a stable snapshot value.
const versions = new Map<string, number>();
for (const table of ['people', 'companies', 'interactions', 'outbox']) {
  cache.subscribe(table, () => versions.set(table, (versions.get(table) ?? 0) + 1));
}

/* ── fetching ────────────────────────────────────────────────────────────── */

async function workspace(): Promise<string | null> {
  return (await loadCredential())?.workspaceId ?? null;
}

/**
 * Refresh a list from the server into the mirror.
 *
 * Failure is deliberately quiet: the screen already has content, and an error
 * banner over readable data is worse than the data being a few minutes old. The
 * offline indicator carries that message once, globally, instead.
 */
export async function refreshPeople(opts: { q?: string } = {}): Promise<void> {
  const ws = await workspace();
  if (!ws) return;
  try {
    const res = await request<{ data: cache.PersonRow[]; nextCursor: string | null }>('/people', {
      query: { limit: 50, q: opts.q }
    });
    const rows = Array.isArray(res) ? (res as unknown as cache.PersonRow[]) : res.data;
    await cache.upsertPeople(ws, rows);
  } catch (err) {
    if (!(err instanceof ApiError) || err.code !== 'offline') throw err;
  }
}

export async function refreshInteractions(): Promise<void> {
  const ws = await workspace();
  if (!ws) return;
  try {
    const rows = await request<cache.InteractionRow[]>('/interactions', {
      query: { limit: 50 }
    });
    await cache.upsertInteractions(ws, rows);
  } catch (err) {
    if (!(err instanceof ApiError) || err.code !== 'offline') throw err;
  }
}

/* ── writing ─────────────────────────────────────────────────────────────── */

/**
 * Patch a person optimistically.
 *
 * The shape is deliberately the same three lines as the web's
 * `listCache.patch`: apply locally, keep what it was, let the outbox reconcile.
 * No `invalidateAll` equivalent and no refetch on success — the server's answer
 * to "did that work" is the absence of a rollback.
 */
export async function patchPerson(
  id: string,
  patch: Record<string, unknown>,
  api: Record<string, unknown> = patch
): Promise<void> {
  const ws = await workspace();
  if (!ws) return;
  const prev = await cache.patchPerson(ws, id, patch as never);
  if (!prev) return;

  await enqueue({
    workspaceId: ws,
    method: 'PATCH',
    path: `/people/${id}`,
    body: api,
    entityTable: 'people',
    entityId: id,
    prev
  });
  void kick();
}

/**
 * Log an interaction, showing it immediately.
 *
 * The local id is swapped for the server's on success. Milestone 1 only creates
 * interactions, which nothing else references — when offline *person* creation
 * lands, queued entries will need their paths rewritten too, which is why the
 * local id is prefixed and recognisable rather than a bare cuid.
 */
export async function logInteraction(input: {
  type: string;
  title: string;
  body?: string | null;
  personId?: string;
  personName?: string;
}): Promise<void> {
  const ws = await workspace();
  if (!ws) return;

  const localId = `local_${Date.now().toString(36)}`;
  const now = Date.now();

  await cache.insertLocalInteraction(ws, {
    id: localId,
    occurredAt: now,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    companyId: null,
    companyName: null,
    people: input.personId
      ? [{ id: input.personId, name: input.personName ?? '', avatarUrl: null }]
      : [],
    createdAt: now,
    updatedAt: now
  });

  await enqueue({
    workspaceId: ws,
    method: 'POST',
    path: '/interactions',
    body: {
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      occurredAt: now,
      personIds: input.personId ? [input.personId] : []
    },
    entityTable: 'interactions',
    entityId: localId
  });
  void kick();
}

/* ── the replayer ────────────────────────────────────────────────────────── */

let kicking = false;

/** Try to drain the outbox now. Safe to call often; it de-duplicates itself. */
export async function kick(): Promise<void> {
  if (kicking) return;
  kicking = true;
  try {
    await flush();
    // A create that succeeded replaced a local row; the cheapest way to pick up
    // the server's version of everything is one list refresh.
    await refreshInteractions().catch(() => {});
  } finally {
    kicking = false;
    cache.notify('outbox');
  }
}

/**
 * Drain when the connection comes back.
 *
 * NetInfo reports `isInternetReachable` separately from `isConnected`, and the
 * difference matters: a captive portal or a VPN mid-handshake is "connected"
 * and useless. Waiting for reachability avoids a burst of doomed retries that
 * each burn a backoff step.
 */
export function startReplayer(): () => void {
  const unsub = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) void kick();
  });
  void kick();
  return unsub;
}

/** How many writes are still queued, for the offline banner. */
export function usePendingWrites(): number {
  const [n, setN] = useState(0);
  const version = useSyncExternalStore(
    (cb) => cache.subscribe('outbox', cb),
    () => versions.get('outbox') ?? 0
  );
  useEffect(() => {
    pendingCount().then(setN).catch(() => {});
  }, [version]);
  return n;
}

/** Whether the device currently has usable connectivity. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((s) =>
        setOnline(!!s.isConnected && s.isInternetReachable !== false)
      ),
    []
  );
  return online;
}
