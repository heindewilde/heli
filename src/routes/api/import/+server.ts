import { requireScope, requireRole } from '$lib/server/scope';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPendingImport, deletePendingImport, CONTACTS_IMPORT_COOKIE } from '$lib/server/google';
import { db } from '$lib/server/db';
import { people } from '$lib/server/schema';
import { createId } from '@paralleldrive/cuid2';
import { sanitize } from '$lib/server/sanitize';
import { domainOf } from '$lib/server/url';
import { deriveHandle } from '$lib/server/classify';
import { bumpSearchEpoch } from '$lib/server/search';

export const POST: RequestHandler = async ({ locals, cookies }) => {
  const s = requireScope(locals);
  // Bulk insert into the shared people table, unbounded by design (it commits
  // whatever the staged import holds). Admin-only.
  requireRole(s, 'owner', 'admin');

  const importId = cookies.get(CONTACTS_IMPORT_COOKIE);
  if (!importId) throw error(400, 'no_pending_import');

  const pending = getPendingImport(importId, s.userId);
  if (!pending) throw error(400, 'import_expired');

  const d = db(s.region);
  const now = Date.now();
  let imported = 0;
  let errors = 0;

  for (const contact of pending.toImport) {
    try {
      // `url`, `domain` and `handle` are what make an imported person the *same*
      // record as a later capture of their profile: the extension looks a URL up
      // through `/api/v1/lookup`, which matches on the unique
      // (workspace_id, url). Import a connection without the URL and capturing
      // them from the browser creates a second person instead of enriching the
      // first. `linkedinCsv` has already put it through the same `cleanUrl`.
      const u = contact.url ? new URL(contact.url) : null;
      await d.insert(people).values({
        id: createId(),
        workspaceId: s.workspaceId,
        userId: s.userId,
        name: contact.name,
        url: contact.url ?? null,
        domain: u ? domainOf(u) : null,
        handle: u ? deriveHandle(u) : null,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        role: contact.role ?? null,
        location: contact.location ?? null,
        notes: contact.notes ? sanitize(contact.notes) : null,
        suggestedCompanyName: contact.suggestedCompanyName ?? null,
        isFavorite: 0,
        isArchived: 0,
        source: pending.source,
        createdAt: now,
        updatedAt: now
      });
      imported++;
    } catch {
      errors++;
    }
  }

  // Several hundred new people are exactly the case the per-workspace search
  // epoch exists for; without this they stay missing from cached results.
  if (imported > 0) bumpSearchEpoch(s.workspaceId);

  deletePendingImport(importId);
  cookies.delete(CONTACTS_IMPORT_COOKIE, { path: '/' });

  return json({ imported, duplicates: pending.duplicateCount, errors });
};

export const DELETE: RequestHandler = async ({ locals, cookies }) => {
  const s = requireScope(locals);

  const importId = cookies.get(CONTACTS_IMPORT_COOKIE);
  if (importId) {
    deletePendingImport(importId);
    cookies.delete(CONTACTS_IMPORT_COOKIE, { path: '/' });
  }

  return new Response(null, { status: 204 });
};
