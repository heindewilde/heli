import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { idempotencyKeys } from './schema';
import type { Scope } from './scope';

/**
 * Replay-safe writes, for clients that retry.
 *
 * The mobile app queues writes made offline and replays them on reconnect. The
 * dangerous case is not a failed request — it is an *ambiguous* one: the
 * request arrived and was applied, the response never got back, and the client
 * cannot tell that from a request that never landed. Retrying is the only
 * correct thing it can do, and without this that turns one logged call into
 * two.
 *
 * A client opts in by sending `Idempotency-Key`. The stored response is
 * replayed verbatim, so a retry is indistinguishable from the original as far
 * as the caller is concerned.
 *
 * Scoped by workspace as well as key, so a key guessed or reused across tenants
 * cannot surface another workspace's response body.
 *
 * `idempotency_keys` is deliberately **not** in `TENANT_TABLES`: it holds no
 * CRM data, only a cached response, and it is swept by time rather than by
 * ownership. Its `workspace_id` is a lookup key, not tenancy in the sense the
 * backfill means.
 */

function hash(workspaceId: string, key: string): string {
  return createHash('sha256').update(`${workspaceId}:${key}`).digest('hex');
}

/** The header, validated. Absent or implausible means "no idempotency". */
export function idempotencyKeyFrom(request: Request): string | null {
  const raw = request.headers.get('idempotency-key')?.trim();
  if (!raw) return null;
  // Long enough to be unguessable, short enough not to be a payload.
  return raw.length >= 8 && raw.length <= 200 ? raw : null;
}

/**
 * Run `handler` at most once per key.
 *
 * Deliberately *not* a lock. Two truly concurrent requests with the same key
 * can both run — the window is milliseconds and the realistic client is one
 * phone replaying a queue serially. Holding a transaction open across a handler
 * would serialise every write in the workspace to remove a race nobody has.
 */
export async function withIdempotency(
  s: Scope,
  key: string | null,
  handler: () => Promise<Response>
): Promise<Response> {
  if (!key) return handler();

  const d = db(s.region);
  const keyHash = hash(s.workspaceId, key);

  const existing = await d
    .select({ status: idempotencyKeys.status, response: idempotencyKeys.response })
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.keyHash, keyHash),
        eq(idempotencyKeys.workspaceId, s.workspaceId)
      )
    )
    .get();

  if (existing) {
    return new Response(existing.response, {
      status: existing.status,
      headers: { 'content-type': 'application/json', 'Idempotent-Replay': 'true' }
    });
  }

  const res = await handler();

  // Only successes are recorded. Replaying a 4xx would pin a validation failure
  // the client may have since corrected, and replaying a 5xx would make a
  // transient fault permanent — the one thing a retry is supposed to fix.
  if (res.ok) {
    const body = await res.clone().text();
    await d
      .insert(idempotencyKeys)
      .values({
        keyHash,
        workspaceId: s.workspaceId,
        status: res.status,
        response: body,
        createdAt: Date.now()
      })
      // A concurrent duplicate lost the race; its response was equivalent.
      .onConflictDoNothing();
  }

  return res;
}
