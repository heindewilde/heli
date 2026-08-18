import { error, json, type RequestHandler } from '@sveltejs/kit';
import { createId } from '@paralleldrive/cuid2';
import { requireScope } from '$lib/server/scope';
import { db } from '$lib/server/db';
import { people, companies } from '$lib/server/schema';
import { bumpSearchEpoch } from '$lib/server/search';
import { enqueueEnrichment } from '$lib/server/enrichQueue';
import {
  derivePersonRow,
  enrichPerson,
  servesAuthwall
} from '$lib/server/savePerson';
import { deriveCompanyRow, enrichCompany } from '$lib/server/saveCompany';
import {
  URL_IMPORT_COOKIE,
  getPendingUrlImport,
  deletePendingUrlImport
} from '$lib/server/urlImport';

/**
 * Commit a staged paste.
 *
 * **It does not call `savePerson` per row, and that is the one interesting
 * decision here.** `savePerson` is a dedupe SELECT plus an INSERT, so 500 rows
 * would be a thousand sequential round trips inside one handler — the same
 * shape `CHUNK = 100` already solved in `/api/import`. Existence was resolved
 * once, for the whole paste, at staging time.
 *
 * What it must *not* do is re-derive the row shape. `url`, `domain` and
 * `handle` are what decide whether a later capture of the same profile
 * deduplicates or creates a second person, so both paths call the one
 * definition — `derivePersonRow` / `deriveCompanyRow`, exported from the save
 * modules for exactly this.
 *
 * Enrichment is queued on the `bulk` lane, so an ordinary save made while a
 * 500-row drain is running does not wait behind it.
 */
const CHUNK = 100;

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);

  const token = cookies.get(URL_IMPORT_COOKIE);
  if (!token) throw error(400, 'nothing_staged');
  const pending = getPendingUrlImport(token, locals.user.id);
  if (!pending) throw error(400, 'nothing_staged');

  const { include, kinds } = await readSelection(request);

  // Indices, never rows — the server only ever inserts data it parsed itself,
  // the same rule `/api/import` follows. The worst a bad body can do is import
  // fewer records.
  const wanted =
    include === null
      ? pending.rows.map((_, i) => i)
      : [...new Set(include.filter((i) => Number.isInteger(i) && i >= 0 && i < pending.rows.length))];

  // Raised *before* the staged batch is discarded: a mis-click must not cost
  // somebody the paste they have been triaging.
  if (wanted.length === 0) throw error(400, 'empty_selection');

  const now = Date.now();
  type Queued = { id: string; u: URL; kind: 'person' | 'company' };
  const personRows: Record<string, unknown>[] = [];
  const companyRows: Record<string, unknown>[] = [];
  const queued: Queued[] = [];
  let skipped = 0;

  for (const i of wanted) {
    const row = pending.rows[i];
    // Already in the workspace — re-inserting would collide on
    // `uq_{people,companies}_ws_url` and take its whole chunk down with it.
    if (row.existingId) {
      skipped += 1;
      continue;
    }
    const kind = kinds?.[String(i)] ?? row.kind;
    let u: URL;
    try {
      u = new URL(row.url);
    } catch {
      skipped += 1;
      continue;
    }
    const id = createId();
    /**
     * `parsing` means "something is still coming for this row": it shows a
     * spinner and hands the row to the boot janitor. Both are wrong for a host
     * we have already decided not to fetch — an authwalled profile would spin
     * until the next restart, because nothing was ever queued to clear it.
     * A LinkedIn import is complete the moment it is inserted.
     */
    const willEnrich = kind === 'company' || !servesAuthwall(u);
    const base = {
      id,
      workspaceId: s.workspaceId,
      userId: s.userId,
      isFavorite: 0,
      isArchived: 0,
      source: willEnrich ? 'parsing' : null,
      createdAt: now,
      updatedAt: now
    };
    if (kind === 'person') personRows.push({ ...base, ...derivePersonRow(u) });
    else companyRows.push({ ...base, ...deriveCompanyRow(u) });
    if (willEnrich) queued.push({ id, u, kind });
  }

  let imported = 0;
  let errors = 0;
  const failed = new Set<string>();

  for (const [table, rows] of [
    [people, personRows],
    [companies, companyRows]
  ] as const) {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      try {
        await db(s.region)
          .insert(table)
          .values(chunk as never);
        imported += chunk.length;
      } catch {
        // Retry row by row so one bad row costs one record rather than a
        // hundred, and so `errors` counts records rather than chunks.
        for (const one of chunk) {
          try {
            await db(s.region)
              .insert(table)
              .values(one as never);
            imported += 1;
          } catch {
            errors += 1;
            failed.add(one.id as string);
          }
        }
      }
    }
  }

  // Queue only what actually landed. Authwalled hosts were already left out
  // above, along with their `parsing` marker.
  let enqueued = 0;
  let dropped = 0;
  for (const q of queued) {
    if (failed.has(q.id)) continue;
    const ok = enqueueEnrichment(
      q.kind === 'person'
        ? () => enrichPerson(q.id, s, q.u)
        : () => enrichCompany(q.id, s, q.u),
      'bulk'
    );
    if (ok) enqueued += 1;
    else dropped += 1;
  }

  if (imported > 0) bumpSearchEpoch(s.workspaceId);

  deletePendingUrlImport(locals.user.id);
  cookies.delete(URL_IMPORT_COOKIE, { path: '/' });

  return json({ imported, skipped, errors, enqueued, dropped });
};

async function readSelection(
  request: Request
): Promise<{ include: number[] | null; kinds: Record<string, 'person' | 'company'> | null }> {
  // Not `request.json()`: it throws on an empty body, and an empty body is the
  // "all of it" case a direct API caller expects.
  const raw = await request.text().catch(() => '');
  if (!raw.trim()) return { include: null, kinds: null };
  let body: { include?: unknown; kinds?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    throw error(400, 'invalid_json');
  }
  const include = Array.isArray(body.include) ? body.include.map(Number) : null;
  const kinds =
    body.kinds && typeof body.kinds === 'object'
      ? (Object.fromEntries(
          Object.entries(body.kinds as Record<string, unknown>).filter(
            ([, v]) => v === 'person' || v === 'company'
          )
        ) as Record<string, 'person' | 'company'>)
      : null;
  return { include, kinds };
}
