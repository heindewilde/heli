import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPendingImport, deletePendingImport, CONTACTS_IMPORT_COOKIE } from '$lib/server/google';
import { db } from '$lib/server/db';
import { people } from '$lib/server/schema';
import { createId } from '@paralleldrive/cuid2';
import { sanitize } from '$lib/server/sanitize';

export const POST: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user) throw error(401, 'unauthorized');

  const importId = cookies.get(CONTACTS_IMPORT_COOKIE);
  if (!importId) throw error(400, 'no_pending_import');

  const pending = getPendingImport(importId, locals.user.id);
  if (!pending) throw error(400, 'import_expired');

  const d = db(locals.user.region);
  const now = Date.now();
  let imported = 0;
  let errors = 0;

  for (const contact of pending.toImport) {
    try {
      await d.insert(people).values({
        id: createId(),
        userId: locals.user.id,
        name: contact.name,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        role: contact.role ?? null,
        location: contact.location ?? null,
        notes: contact.notes ? sanitize(contact.notes) : null,
        suggestedCompanyName: contact.suggestedCompanyName ?? null,
        isFavorite: 0,
        isArchived: 0,
        source: 'google_contacts',
        createdAt: now,
        updatedAt: now
      });
      imported++;
    } catch {
      errors++;
    }
  }

  deletePendingImport(importId);
  cookies.delete(CONTACTS_IMPORT_COOKIE, { path: '/' });

  return json({ imported, duplicates: pending.duplicateCount, errors });
};

export const DELETE: RequestHandler = async ({ locals, cookies }) => {
  if (!locals.user) throw error(401, 'unauthorized');

  const importId = cookies.get(CONTACTS_IMPORT_COOKIE);
  if (importId) {
    deletePendingImport(importId);
    cookies.delete(CONTACTS_IMPORT_COOKIE, { path: '/' });
  }

  return new Response(null, { status: 204 });
};
