import { db } from './index';
import { notify } from './cache';
import { ApiError, request } from '../api/client';
import { isRetryable, mergePatch, retryDelay, rollbackFields } from './replay-policy';

/**
 * Writes that have not reached the server yet.
 *
 * The rules here are the ones that decide whether offline editing is trustworthy
 * or merely present, so they are worth stating:
 *
 * **Strictly FIFO, one request in flight.** Two PATCHes on the same row replayed
 * concurrently give last-*arrival* wins, not last-*write* wins — the order the
 * user made the edits in stops meaning anything.
 *
 * **A 4xx is not retried.** It is a decision the server has made and will make
 * again; replaying it burns battery and never converges. The entry is marked
 * `failed`, its optimistic patch is rolled back, and it is surfaced. A silently
 * dropped write is worse than a visible one.
 *
 * **Conflict policy is last-write-wins, because that is what the server already
 * does.** There is no `If-Match` on any endpoint and no version column, so a
 * conflict UI here would be inventing a conflict the server cannot report.
 */

export type OutboxEntry = {
  id: string;
  workspaceId: string;
  createdAt: number;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body: string | null;
  idempotencyKey: string;
  entityTable: string | null;
  entityId: string | null;
  prev: string | null;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  state: 'pending' | 'failed';
};

/**
 * Ids for outbox entries and idempotency keys.
 *
 * A counter plus the epoch, not a UUID: `crypto.randomUUID()` is undefined
 * outside a secure context and unreliable in Hermes, and pulling in a cuid
 * package would drag `@noble/hashes` — the exact mistake `CLAUDE.md` records
 * for `toasts.svelte.ts` on the web.
 */
let seq = 0;
function localId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

type EnqueueInput = {
  workspaceId: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  entityTable?: string;
  entityId?: string;
  /** The row as it was before the optimistic patch, for rollback. */
  prev?: unknown;
};

export async function enqueue(input: EnqueueInput): Promise<string> {
  const handle = await db();
  const id = localId('ob');

  /**
   * Coalesce into a pending PATCH for the same row.
   *
   * Without this a twenty-tap priority toggle is twenty requests, nineteen of
   * which are already wrong by the time they are sent. Only PATCHes coalesce,
   * and only while nothing has been attempted — merging into an entry that is
   * mid-flight would change a body the server is already reading.
   */
  if (input.method === 'PATCH' && input.entityId) {
    const existing = await handle.getFirstAsync<{ id: string; body: string | null }>(
      `SELECT id, body FROM outbox
        WHERE state = 'pending' AND attempts = 0 AND method = 'PATCH'
          AND entity_table = ? AND entity_id = ?
        ORDER BY created_at DESC LIMIT 1`,
      input.entityTable ?? null,
      input.entityId
    );
    if (existing) {
      const merged = mergePatch(
        JSON.parse(existing.body ?? '{}'),
        (input.body ?? {}) as Record<string, unknown>
      );
      await handle.runAsync(`UPDATE outbox SET body = ? WHERE id = ?`, [
        JSON.stringify(merged),
        existing.id
      ]);
      return existing.id;
    }
  }

  await handle.runAsync(
    `INSERT INTO outbox
       (id, workspace_id, created_at, method, path, body, idempotency_key,
        entity_table, entity_id, prev, attempts, next_attempt_at, state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'pending')`,
    [
      id,
      input.workspaceId,
      Date.now(),
      input.method,
      input.path,
      input.body === undefined ? null : JSON.stringify(input.body),
      localId('idem'),
      input.entityTable ?? null,
      input.entityId ?? null,
      input.prev === undefined ? null : JSON.stringify(input.prev)
    ]
  );

  if (input.entityTable && input.entityId) {
    await handle.runAsync(
      `UPDATE ${input.entityTable} SET pending = 1 WHERE id = ?`,
      input.entityId
    );
  }
  return id;
}

export async function pendingCount(): Promise<number> {
  const handle = await db();
  const row = await handle.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE state = 'pending'`
  );
  return row?.n ?? 0;
}

export async function failedEntries(): Promise<OutboxEntry[]> {
  const handle = await db();
  return handle.getAllAsync<OutboxEntry>(
    `SELECT * FROM outbox WHERE state = 'failed' ORDER BY created_at`
  );
}

export async function discard(id: string): Promise<void> {
  const handle = await db();
  await handle.runAsync(`DELETE FROM outbox WHERE id = ?`, id);
}

/* ── replay ──────────────────────────────────────────────────────────────── */

let running = false;

export type FlushResult = { sent: number; failed: number; blocked: boolean };

/**
 * Send everything ready, oldest first, stopping at the first entry that cannot
 * go through.
 *
 * Stopping matters: entries frequently depend on each other — logging an
 * interaction against a person created moments earlier — so skipping ahead past
 * a stuck entry would apply later work against a row the server does not have.
 */
export async function flush(): Promise<FlushResult> {
  if (running) return { sent: 0, failed: 0, blocked: false };
  running = true;
  const handle = await db();
  const result: FlushResult = { sent: 0, failed: 0, blocked: false };

  try {
    for (;;) {
      const entry = await handle.getFirstAsync<OutboxEntry & { entity_table: string | null; entity_id: string | null; idempotency_key: string; next_attempt_at: number }>(
        `SELECT * FROM outbox
          WHERE state = 'pending' AND next_attempt_at <= ?
          ORDER BY created_at LIMIT 1`,
        Date.now()
      );
      if (!entry) break;

      try {
        const created = await request<Record<string, unknown> | undefined>(entry.path, {
          method: entry.method,
          body: entry.body ? JSON.parse(entry.body) : undefined,
          idempotencyKey: entry.idempotency_key
        });

        await handle.runAsync(`DELETE FROM outbox WHERE id = ?`, entry.id);

        /**
         * A create has to swap its local row for the server's.
         *
         * The row was inserted under a `local_…` id so it could appear
         * instantly; the server assigns the real one. Without this swap the
         * next list refresh upserts the server's copy *alongside* the local
         * one and every interaction logged offline shows up twice — which
         * looks like the send happened twice, i.e. exactly the failure
         * `Idempotency-Key` exists to rule out.
         */
        if (entry.method === 'POST' && entry.entity_table && entry.entity_id && created?.id) {
          await replaceLocal(entry.entity_table, entry.entity_id, created);
        } else {
          await clearPending(entry.entity_table, entry.entity_id);
        }
        result.sent++;
      } catch (err) {
        const api = err instanceof ApiError ? err : null;

        if (api && !isRetryable({ code: api.code, status: api.status })) {
          // Terminal. Roll the optimistic value back so the UI stops showing an
          // edit that will never exist, and surface it rather than dropping it.
          await handle.runAsync(
            `UPDATE outbox SET state = 'failed', last_error = ? WHERE id = ?`,
            [api.message, entry.id]
          );
          await rollback(entry);
          result.failed++;
          result.blocked = true;
          break;
        }

        const attempts = entry.attempts + 1;
        const delay = retryDelay(attempts);
        await handle.runAsync(
          `UPDATE outbox SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?`,
          [attempts, Date.now() + delay, api?.message ?? String(err), entry.id]
        );
        result.blocked = true;
        break;
      }
    }
  } finally {
    running = false;
  }
  return result;
}

async function clearPending(table: string | null, id: string | null): Promise<void> {
  if (!table || !id) return;
  const handle = await db();
  await handle.runAsync(`UPDATE ${table} SET pending = 0 WHERE id = ?`, id);
  notify(table);
}

/**
 * Delete the local placeholder now that the server row exists.
 *
 * Deliberately a delete rather than an id rewrite: the caller's next refresh
 * upserts the server's version with every field it knows about, and rewriting
 * the id here would leave a row carrying whatever the client guessed at insert
 * time until something overwrote it.
 *
 * When offline *person* creation lands this will need to rewrite queued outbox
 * paths too — an interaction logged against a person who only exists locally
 * references an id the server has never seen. Interactions are referenced by
 * nothing, which is why they were safe to do first.
 */
async function replaceLocal(
  table: string,
  localId: string,
  serverRow: Record<string, unknown>
): Promise<void> {
  const handle = await db();
  await handle.runAsync(`DELETE FROM ${table} WHERE id = ?`, localId);
  void serverRow;
  notify(table);
}

async function rollback(entry: {
  entity_table: string | null;
  entity_id: string | null;
  prev: string | null;
  method: string;
}): Promise<void> {
  const handle = await db();
  if (!entry.entity_table || !entry.entity_id) return;

  if (entry.method === 'POST') {
    // The row only ever existed locally.
    await handle.runAsync(`DELETE FROM ${entry.entity_table} WHERE id = ?`, entry.entity_id);
    return;
  }
  if (!entry.prev) {
    await clearPending(entry.entity_table, entry.entity_id);
    return;
  }

  const prev = JSON.parse(entry.prev) as Record<string, unknown>;
  // Only the columns the failed write actually touched — `prev` is already
  // narrowed to those at enqueue time, and rollbackFields keeps that true if it
  // ever stops being.
  const restore = rollbackFields(prev, prev);
  const cols = Object.keys(restore);
  if (cols.length === 0) return;
  await handle.runAsync(
    `UPDATE ${entry.entity_table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, pending = 0 WHERE id = ?`,
    [...cols.map((c) => restore[c] as never), entry.entity_id]
  );
}
