import { error, json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { requireScope, requireRole } from '$lib/server/scope';
import { db } from '$lib/server/db';
import { people } from '$lib/server/schema';
import {
  CONTACTS_IMPORT_COOKIE,
  storePendingImport,
  ImportTooLargeError,
  type MappedPerson
} from '$lib/server/contactImport';
import { parseLinkedInConnections } from '$lib/server/linkedinCsv';

/**
 * Stage a LinkedIn "Export connections" CSV.
 *
 * Stages only — `POST /api/import` commits, unchanged, because the staged shape
 * is identical to the Google Contacts flow's. Same admin-only gate as that
 * commit: this ends in an unbounded bulk insert into the shared people table,
 * so a member must not be shown a flow that 403s at the last step.
 */

/** A 40k-connection export is roughly 3 MB; this is headroom, not a target. */
const MAX_BYTES = 8 * 1024 * 1024;

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  const s = requireScope(locals);
  requireRole(s, 'owner', 'admin');

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BYTES) throw error(413, 'file_too_large');

  let text: string;
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw error(400, 'no_file');
    if (file.size > MAX_BYTES) throw error(413, 'file_too_large');
    text = await file.text();
  } else {
    text = await request.text();
  }
  if (!text.trim()) throw error(400, 'empty_file');

  const { people: parsed, skipped } = parseLinkedInConnections(text);
  if (parsed.length === 0) {
    // Almost always the wrong file — the archive LinkedIn emails contains a
    // dozen CSVs and only one of them is Connections.csv.
    throw error(422, 'not_a_connections_export');
  }

  // One query for the whole workspace rather than a lookup per row: this runs
  // against remote libSQL in the cloud, where round trips are the cost.
  const existing = await db(s.region)
    .select({ url: people.url, email: people.email })
    .from(people)
    .where(eq(people.workspaceId, s.workspaceId));

  const existingUrls = new Set(existing.map((p) => p.url).filter(Boolean) as string[]);
  const existingEmails = new Set(
    existing.map((p) => p.email?.toLowerCase().trim()).filter(Boolean) as string[]
  );

  const toImport: MappedPerson[] = [];
  let duplicateCount = 0;
  // A profile URL is a far better identity than an email here, since most rows
  // have no email at all. Both are checked; the file is also deduped against
  // itself, because a re-export merged with an older one is a real thing users do.
  const seen = new Set<string>();
  for (const p of parsed) {
    const key = p.url ?? (p.email ? `mailto:${p.email.toLowerCase()}` : null);
    const isDuplicate =
      (p.url && existingUrls.has(p.url)) ||
      (p.email && existingEmails.has(p.email.toLowerCase())) ||
      (key !== null && seen.has(key));
    if (isDuplicate) {
      duplicateCount++;
      continue;
    }
    if (key) seen.add(key);
    toImport.push(p);
  }

  // A staged import is held in memory until it is committed, so the row count is
  // a memory budget rather than a product limit. Rejected here with the count so
  // the message can say what to do about it, not just that it failed.
  let importId: string;
  try {
    importId = storePendingImport(s.userId, toImport, duplicateCount, 'linkedin_csv');
  } catch (e) {
    if (e instanceof ImportTooLargeError) throw error(413, 'too_many_rows');
    throw e;
  }
  cookies.set(CONTACTS_IMPORT_COOKIE, importId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev,
    maxAge: 900
  });

  return json({ staged: toImport.length, duplicates: duplicateCount, skipped });
};
