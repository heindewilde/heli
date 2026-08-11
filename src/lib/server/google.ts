import type { MappedPerson } from './contactImport';

export const GOOGLE_PENDING_COOKIE = 'google_pending';

// The staging primitives moved to `contactImport.ts` when the LinkedIn CSV
// import began sharing them. Re-exported here so existing importers of this
// module keep working, and because the Google flow is still their main caller.
export {
  CONTACTS_IMPORT_COOKIE,
  storePendingImport,
  getPendingImport,
  deletePendingImport,
  type MappedPerson
} from './contactImport';

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
