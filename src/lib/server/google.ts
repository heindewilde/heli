import { createId } from '@paralleldrive/cuid2';

export const CONTACTS_IMPORT_COOKIE = 'google_contacts_import';

export type MappedPerson = {
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  location: string | null;
  notes: string | null;
  suggestedCompanyName: string | null;
};

type PendingImportRecord = {
  userId: string;
  toImport: MappedPerson[];
  duplicateCount: number;
  expiresAt: number;
};

const IMPORT_TTL_MS = 15 * 60 * 1000;
const pendingImports = new Map<string, PendingImportRecord>();

export function storePendingImport(
  userId: string,
  toImport: MappedPerson[],
  duplicateCount: number
): string {
  const id = createId();
  pendingImports.set(id, { userId, toImport, duplicateCount, expiresAt: Date.now() + IMPORT_TTL_MS });
  return id;
}

export function getPendingImport(
  id: string,
  userId: string
): { toImport: MappedPerson[]; duplicateCount: number } | null {
  const record = pendingImports.get(id);
  if (!record) return null;
  if (record.userId !== userId) return null;
  if (record.expiresAt < Date.now()) {
    pendingImports.delete(id);
    return null;
  }
  return { toImport: record.toImport, duplicateCount: record.duplicateCount };
}

export function deletePendingImport(id: string): void {
  pendingImports.delete(id);
}

type GooglePerson = {
  names?: Array<{ displayName?: string }>;
  emailAddresses?: Array<{ value?: string }>;
  phoneNumbers?: Array<{ value?: string }>;
  addresses?: Array<{ formattedValue?: string }>;
  organizations?: Array<{ name?: string; title?: string }>;
  biographies?: Array<{ value?: string }>;
};

export async function fetchGoogleContacts(accessToken: string): Promise<MappedPerson[]> {
  const results: MappedPerson[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      personFields: 'names,emailAddresses,phoneNumbers,addresses,organizations,biographies',
      pageSize: '200'
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`https://people.googleapis.com/v1/people/me/connections?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error(`Google People API error: ${res.status}`);

    const data = (await res.json()) as { connections?: GooglePerson[]; nextPageToken?: string };
    for (const p of data.connections ?? []) {
      const name = p.names?.[0]?.displayName?.trim();
      if (!name) continue;
      results.push({
        name,
        email: p.emailAddresses?.[0]?.value?.trim() || null,
        phone: p.phoneNumbers?.[0]?.value?.trim() || null,
        role: p.organizations?.[0]?.title?.trim() || null,
        location: p.addresses?.[0]?.formattedValue?.trim() || null,
        notes: p.biographies?.[0]?.value?.trim() || null,
        suggestedCompanyName: p.organizations?.[0]?.name?.trim() || null
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken && results.length < 2000);

  return results;
}
