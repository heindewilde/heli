import { db } from './index';
import { ApiError, request } from '../api/client';

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
      const merged = { ...JSON.parse(existing.body ?? '{}'), ...(input.body as object) };
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
        await request(entry.path, {
          method: entry.method,
          body: entry.body ? JSON.parse(entry.body) : undefined,
          idempotencyKey: entry.idempotency_key
        });
        await handle.runAsync(`DELETE FROM outbox WHERE id = ?`, entry.id);
        await clearPending(entry.entity_table, entry.entity_id);
        result.sent++;
      } catch (err) {
        const api = err instanceof ApiError ? err : null;

        if (api && !api.retryable) {
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
        // Exponential, capped at an hour. The cap matters: a phone left offline
        // for a week should not come back and hammer the server, nor wait a
        // week to try again.
        const delay = Math.min(60_000 * 2 ** (attempts - 1), 3_600_000);
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
  const cols = Object.keys(prev);
  if (cols.length === 0) return;
  await handle.runAsync(
    `UPDATE ${entry.entity_table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, pending = 0 WHERE id = ?`,
    [...cols.map((c) => prev[c] as never), entry.entity_id]
  );
}
