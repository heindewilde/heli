import { createId } from '@paralleldrive/cuid2';

/**
 * Staging for a bulk URL paste: parse and dedupe first, show the user what is
 * about to happen, commit only on confirmation.
 *
 * The same shape and the same discipline as `contactImport.ts` — one slot per
 * user, the token stored inside the record, a sweep on every write — but its
 * own map and its own cookie, and that separation is deliberate:
 *
 *  - Sharing one slot would mean pasting a list of links silently destroys a
 *    half-triaged 3,400-row LinkedIn CSV. "A re-upload replaces its
 *    predecessor" is a fair rule *within* one kind of import and a surprise
 *    across two.
 *  - Sharing `MappedPerson` would make it a union carrying a `kind` that is
 *    permanently `'person'` for both contact sources, and every consumer of
 *    the contacts commit path would have to narrow it for no reason.
 *
 * In-process and short-lived, so it dies with the process — which is the right
 * outcome. The user re-pastes.
 */

export const URL_IMPORT_COOKIE = 'url_import';

export type MappedUrl = {
  /** Already through `cleanUrl`, so it is byte-identical to a browser capture. */
  url: string;
  /** From `classify()`, and overridable per row on the review screen. */
  kind: 'person' | 'company';
  /** Host, for the review list — the one thing that reads at a glance. */
  host: string;
  /**
   * What the record would be called before enrichment runs: the humanised
   * handle, or the bare hostname. Shown so the review screen is not a wall of
   * URLs, and so a LinkedIn paste — which never enriches, because
   * `servesAuthwall` skips the fetch — shows what you are actually getting.
   */
  suggestedName: string;
  /** Set when this URL already resolves to a record, so it can be skipped. */
  existingId: string | null;
};

type PendingUrlImport = {
  token: string;
  rows: MappedUrl[];
  duplicateCount: number;
  invalidCount: number;
  expiresAt: number;
};

const TTL_MS = 15 * 60 * 1000;

/**
 * A **network** budget, not a memory one — which is why it is far below
 * `MAX_IMPORT_ROWS`. Every row here costs one to two outbound fetches with a
 * ten-second timeout, so at four concurrent workers 500 rows is already the
 * better part of an hour of draining in the worst case.
 */
export const MAX_URL_IMPORT_ROWS = 500;

export class UrlImportTooLargeError extends Error {
  constructor(readonly rows: number) {
    super('too_many_rows');
  }
}

const pending = new Map<string, PendingUrlImport>();

function sweepExpired(now: number): void {
  for (const [userId, record] of pending) {
    if (record.expiresAt < now) pending.delete(userId);
  }
}

export function storePendingUrlImport(
  userId: string,
  rows: MappedUrl[],
  duplicateCount: number,
  invalidCount: number
): string {
  if (rows.length > MAX_URL_IMPORT_ROWS) throw new UrlImportTooLargeError(rows.length);
  const now = Date.now();
  // The map holds one entry per user mid-triage, so a full sweep on write is
  // cheaper than any bookkeeping that would avoid it — and it is the only thing
  // that reclaims a slot nobody comes back to.
  sweepExpired(now);
  const token = createId();
  pending.set(userId, { token, rows, duplicateCount, invalidCount, expiresAt: now + TTL_MS });
  return token;
}

export function getPendingUrlImport(
  token: string,
  userId: string
): { rows: MappedUrl[]; duplicateCount: number; invalidCount: number } | null {
  // Looked up by the caller's own id, so a colleague holding the token somehow
  // still cannot reach an import they never staged.
  const record = pending.get(userId);
  if (!record) return null;
  if (record.token !== token) return null;
  if (record.expiresAt < Date.now()) {
    pending.delete(userId);
    return null;
  }
  return {
    rows: record.rows,
    duplicateCount: record.duplicateCount,
    invalidCount: record.invalidCount
  };
}

export function deletePendingUrlImport(userId: string): void {
  pending.delete(userId);
}

/** Test seam: staged URL imports currently held in memory. */
export function pendingUrlImportCount(): number {
  return pending.size;
}
