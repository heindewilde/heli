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
};

/**
 * Where the rows came from, recorded on `people.source`. A property of the
 * import rather than of each person — every row in one staged batch shares it.
 * The commit used to hardcode `'google_contacts'`, which became untrue the
 * moment a second source shared the path.
 */
export type ImportSource = 'google_contacts' | 'linkedin_csv';

type PendingImportRecord = {
  userId: string;
  toImport: MappedPerson[];
  duplicateCount: number;
  source: ImportSource;
  expiresAt: number;
};

const IMPORT_TTL_MS = 15 * 60 * 1000;
const pendingImports = new Map<string, PendingImportRecord>();

export function storePendingImport(
  userId: string,
  toImport: MappedPerson[],
  duplicateCount: number,
  source: ImportSource
): string {
  const id = createId();
  pendingImports.set(id, {
    userId,
    toImport,
    duplicateCount,
    source,
    expiresAt: Date.now() + IMPORT_TTL_MS
  });
  return id;
}

export function getPendingImport(
  id: string,
  userId: string
): { toImport: MappedPerson[]; duplicateCount: number; source: ImportSource } | null {
  const record = pendingImports.get(id);
  if (!record) return null;
  // Scoped to the staging user, not the workspace: a colleague must not be able
  // to commit an import they never previewed.
  if (record.userId !== userId) return null;
  if (record.expiresAt < Date.now()) {
    pendingImports.delete(id);
    return null;
  }
  return { toImport: record.toImport, duplicateCount: record.duplicateCount, source: record.source };
}

export function deletePendingImport(id: string): void {
  pendingImports.delete(id);
}
