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

/**
 * The review screen's selection: **indices** into the staged list, never rows.
 * The server goes on reading its own parsed data, so nothing a client posts can
 * reach the insert below — the worst a bad body can do is import fewer people.
 *
 * An absent or empty body still means "all of it", which is what the flow did
 * before there was a review screen and what a direct API caller expects.
 */
async function readSelection(request: Request): Promise<number[] | null> {
  // Not `request.json()`: it throws on an empty body, which is the no-selection
  // case rather than an error.
  const raw = await request.text().catch(() => '');
  if (!raw.trim()) return null;
  let body: { include?: unknown };
  try {
    body = JSON.parse(raw) as { include?: unknown };
  } catch {
    throw error(400, 'invalid_body');
  }
  return Array.isArray(body.include) ? body.include.map(Number) : null;
}

export const POST: RequestHandler = async ({ locals, cookies, request }) => {
  const s = requireScope(locals);
  // Bulk insert into the shared people table, unbounded by design (it commits
  // whatever the staged import holds). Admin-only.
  requireRole(s, 'owner', 'admin');

  const importId = cookies.get(CONTACTS_IMPORT_COOKIE);
  if (!importId) throw error(400, 'no_pending_import');

  const pending = getPendingImport(importId, s.userId);
  if (!pending) throw error(400, 'import_expired');

  const selection = await readSelection(request);
  let toImport = pending.toImport;
  if (selection) {
    const picked = new Set(
      selection.filter((i) => Number.isInteger(i) && i >= 0 && i < pending.toImport.length)
    );
    // Raised *before* the staged import is deleted below: a mis-click must not
    // cost someone the upload they have been triaging for ten minutes.
    if (picked.size === 0) throw error(400, 'empty_selection');
    toImport = pending.toImport.filter((_, i) => picked.has(i));
  }
  const deselected = pending.toImport.length - toImport.length;

  const d = db(s.region);
  const now = Date.now();
  let imported = 0;
  let errors = 0;

  for (const contact of toImport) {
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

  // `deselected` so the result line can say the rest were discarded rather than
  // leaving the user to wonder where they went: committing ends the staged
  // import, selected or not.
  return json({ imported, duplicates: pending.duplicateCount, errors, deselected });
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
