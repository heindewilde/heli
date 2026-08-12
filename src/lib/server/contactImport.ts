import { createId } from '@paralleldrive/cuid2';

/**
 * Staging for a bulk contact import: parse and dedupe first, show the user what
 * is about to happen, commit only on confirmation.
 *
 * This was written for Google Contacts and lived in `google.ts`. It is here now
 * because the LinkedIn connections CSV stages through exactly the same shape,
 * and one commit path serving two sources is better than two that drift. The
 * source-specific part is only the mapping into `MappedPerson`.
 *
 * In-process and short-lived on purpose: a staged import is a few seconds of a
 * user's attention, not state worth a table. It dies with the process, which is
 * the correct outcome — the user re-uploads.
 */

export const CONTACTS_IMPORT_COOKIE = 'google_contacts_import';

export type MappedPerson = {
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  location: string | null;
  notes: string | null;
  /** A company name with no row behind it yet; `/people/[id]` offers to link it. */
  suggestedCompanyName: string | null;
  /**
   * The person's canonical URL, already through `cleanUrl`, when the source has
   * one. Google Contacts does not; the LinkedIn export does, and carrying it
   * means a later capture of the same profile deduplicates against this row
   * instead of creating a second person.
   */
  url?: string | null;
  /**
   * When the connection was made, epoch ms, for sources that record it — only
   * the LinkedIn export does. This exists for the review screen: "everyone I
   * connected with since 2022" is the one filter that turns an 800-row decision
   * into a click. The human-readable date still goes into `notes`; this is for
   * triage, not display, and is never written to a column.
   */
  connectedOn?: number | null;
};

/**
 * Where the rows came from, recorded on `people.source`. A property of the
 * import rather than of each person — every row in one staged batch shares it.
 * The commit used to hardcode `'google_contacts'`, which became untrue the
 * moment a second source shared the path.
 */
export type ImportSource = 'google_contacts' | 'linkedin_csv';

type PendingImportRecord = {
  /**
   * The id handed to the browser in a cookie. Kept *inside* the record rather
   * than used as the map key so that staging is one-per-user (see below) while
   * the cookie still has to match — a stale cookie from a previous upload does
   * not silently commit the current one.
   */
  token: string;
  toImport: MappedPerson[];
  duplicateCount: number;
  source: ImportSource;
  expiresAt: number;
};

const IMPORT_TTL_MS = 15 * 60 * 1000;

/**
 * Keyed by **user id**, not by the staging token, and that is load-bearing.
 *
 * Keyed by token, every upload minted a fresh key while the cookie was
 * overwritten — so the previous entry became unreachable, nothing could ever
 * call `getPendingImport` on it, its `expiresAt` was never read, and it lived
 * until the process died. A user retrying a flaky 3,400-row upload stranded
 * ~1.4 MB a go, and an 8 MB CSV (the upload cap) strands ~22 MB. The docstring
 * above says a staged import "dies with the process"; for those orphans that
 * was the *only* reclamation.
 *
 * One pending import per user is what the UX already offers, so keying by user
 * makes a re-upload replace its predecessor instead of orphaning it.
 */
const pendingImports = new Map<string, PendingImportRecord>();

/**
 * A staged import is held entirely in memory, so the row count is a memory
 * budget, not a product limit. At ~400 bytes per `MappedPerson` this caps one
 * staging slot at ~4 MB. Google already caps its own fetch at 2,000; this is
 * the backstop for LinkedIn, whose export has no inherent bound.
 */
export const MAX_IMPORT_ROWS = 10_000;

/** Thrown when a parsed file is larger than one staging slot may hold. */
export class ImportTooLargeError extends Error {
  constructor(readonly rows: number) {
    super('too_many_rows');
  }
}

function sweepExpired(now: number): void {
  for (const [userId, record] of pendingImports) {
    if (record.expiresAt < now) pendingImports.delete(userId);
  }
}

export function storePendingImport(
  userId: string,
  toImport: MappedPerson[],
  duplicateCount: number,
  source: ImportSource
): string {
  if (toImport.length > MAX_IMPORT_ROWS) throw new ImportTooLargeError(toImport.length);
  const now = Date.now();
  // The map is small (one entry per user mid-triage), so a full sweep on write
  // is cheaper than any bookkeeping that would avoid it, and it is the only
  // thing that reclaims a slot nobody comes back to.
  sweepExpired(now);
  const token = createId();
  pendingImports.set(userId, {
    token,
    toImport,
    duplicateCount,
    source,
    expiresAt: now + IMPORT_TTL_MS
  });
  return token;
}

export function getPendingImport(
  token: string,
  userId: string
): { toImport: MappedPerson[]; duplicateCount: number; source: ImportSource } | null {
  // Looked up by the caller's own id, so a colleague cannot reach an import they
  // never previewed even if they somehow hold its token.
  const record = pendingImports.get(userId);
  if (!record) return null;
  if (record.token !== token) return null;
  if (record.expiresAt < Date.now()) {
    pendingImports.delete(userId);
    return null;
  }
  return { toImport: record.toImport, duplicateCount: record.duplicateCount, source: record.source };
}

export function deletePendingImport(userId: string): void {
  pendingImports.delete(userId);
}

/** Test seam: the count of staged imports currently held in memory. */
export function pendingImportCount(): number {
  return pendingImports.size;
}
