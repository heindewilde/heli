/**
 * The filter half of `/people` and `/companies`, shared by three callers: the
 * two page loaders and `/api/export`.
 *
 * This is not an extraction made for the export endpoint — the two loaders were
 * already byte-identical copies of each other apart from the SQL alias (`p.`
 * vs `c.`), the FTS table name and the tag scope. Those three differences are
 * data, so they live in a `ListScope` constant rather than in a second file.
 *
 * The module owns *parsing* and *SQL fragments* only. It makes no decisions
 * about pagination or about what an empty tag means — the loaders need those to
 * behave differently from the export, so they stay at the call sites.
 *
 * Every fragment is safe to interpolate unconditionally: an absent filter is
 * the empty fragment, never `undefined`.
 */

import { type SQL, sql } from 'drizzle-orm';
import type { Scope } from './scope';
import { ftsQuery } from './search';
import { sqlOr } from './sql-helpers';
import { entityIdsForTag, findTagBySlug } from './tags';

/** What differs between the people list and the companies list, and nothing else. */
export type ListScope = {
  entity: 'person' | 'company';
  /** The alias every fragment is written against. Callers must use the same one. */
  alias: 'p' | 'c';
  /** FTS5 virtual table, which is also the column name in a `MATCH` predicate. */
  ftsTable: 'people_fts' | 'companies_fts';
};

export const PERSON_LIST: ListScope = { entity: 'person', alias: 'p', ftsTable: 'people_fts' };
export const COMPANY_LIST: ListScope = { entity: 'company', alias: 'c', ftsTable: 'companies_fts' };

/** Allowed sort keys. Anything else falls back to 'recent'. */
const SORTS = new Set(['recent', 'updated', 'name', 'lastInteraction', 'priority', 'status']);

export type ListFilters = {
  q: string;
  /** `ftsQuery(q)` — null when q is empty. */
  fts: string | null;
  /**
   * True means *include* archived rows. Named for the direction it reads,
   * because `archived: false` would look like "not archived" when it actually
   * means "hide the archived ones" — and a caller that gets that backwards
   * silently drops rows from an export.
   */
  includeArchived: boolean;
  favorite: boolean;
  sort: string;
  tagSlug: string | null;
  priority: Set<number | null> | null;
  status: Set<string> | null;
};

function parsePriorityFilter(raw: string | null): Set<number | null> | null {
  // Accepts comma-separated subset of "1,2,3,none". Empty/missing = no filter.
  if (!raw) return null;
  const set = new Set<number | null>();
  for (const v of raw.split(',')) {
    const t = v.trim();
    if (t === 'none') set.add(null);
    else if (t === '1' || t === '2' || t === '3') set.add(Number.parseInt(t, 10));
  }
  return set.size > 0 ? set : null;
}

function parseStatusFilter(raw: string | null): Set<string> | null {
  // Comma-separated status ids, with the sentinel "none" for "no status set".
  if (!raw) return null;
  const set = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  return set.size > 0 ? set : null;
}

export function parseListFilters(params: URLSearchParams): ListFilters {
  const q = params.get('q')?.trim() ?? '';
  const sortParam = params.get('sort') ?? 'recent';
  return {
    q,
    fts: ftsQuery(q),
    includeArchived: params.get('archived') === '1',
    favorite: params.get('favorite') === '1',
    sort: SORTS.has(sortParam) ? sortParam : 'recent',
    tagSlug: params.get('tag'),
    priority: parsePriorityFilter(params.get('priority')),
    status: parseStatusFilter(params.get('status'))
  };
}

/**
 * Three outcomes, and the difference between the last two is load-bearing: an
 * unknown slug applies **no** filter, while a known slug with no members means
 * an empty result. Collapsing them would make a mistyped `?tag=` silently
 * return the whole workspace.
 */
export type TagResolution =
  | { kind: 'none' }
  | { kind: 'unknown' }
  | { kind: 'tag'; tag: { id: string; name: string; slug: string }; ids: string[] };

export async function resolveTagFilter(
  s: Scope,
  sc: ListScope,
  f: ListFilters
): Promise<TagResolution> {
  if (!f.tagSlug) return { kind: 'none' };
  const t = await findTagBySlug(s, sc.entity, f.tagSlug);
  if (!t) return { kind: 'unknown' };
  const ids = await entityIdsForTag(s, sc.entity, t.id);
  return { kind: 'tag', tag: { id: t.id, name: t.name, slug: t.slug }, ids };
}

/** The ids a resolution filters to, or null for "no id filter at all". */
export function tagFilterIds(res: TagResolution): string[] | null {
  return res.kind === 'tag' ? res.ids : null;
}

export type ListClauses = {
  archived: SQL;
  favorite: SQL;
  tagIn: SQL;
  priority: SQL;
  status: SQL;
};

export function listClauses(
  sc: ListScope,
  f: ListFilters,
  tagIds: string[] | null
): ListClauses {
  const a = sql.raw(sc.alias);
  return {
    archived: f.includeArchived ? sql`` : sql`AND ${a}.is_archived = 0`,
    favorite: f.favorite ? sql`AND ${a}.is_favorite = 1` : sql``,
    tagIn: tagIds
      ? sql`AND ${a}.id IN (${sql.join(
          tagIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      : sql``,
    priority: f.priority
      ? sqlOr([
          f.priority.has(null) ? sql`${a}.priority IS NULL` : null,
          ...[...f.priority]
            .filter((v): v is number => v !== null)
            .map((n) => sql`${a}.priority = ${n}`)
        ])
      : sql``,
    status: f.status
      ? sqlOr([
          f.status.has('none') ? sql`${a}.status_id IS NULL` : null,
          ...[...f.status].filter((v) => v !== 'none').map((id) => sql`${a}.status_id = ${id}`)
        ])
      : sql``
  };
}

/**
 * ORDER BY for the non-FTS query. NULLs handled inline.
 *
 * Two things callers must honour:
 *  - The **FTS branch orders by `rank` and ignores `sort` entirely**. Don't
 *    interpolate this into a query that has a `MATCH`.
 *  - `lastInteraction` references the `li.` alias, so the caller has to add
 *    `personLastInteractionJoin` / `companyLastInteractionJoin` when that sort
 *    is active. `needsLastInteractionJoin` says when.
 */
export function listOrderClause(sc: ListScope, sort: string): SQL {
  const a = sql.raw(sc.alias);
  if (sort === 'name') return sql`${a}.name COLLATE NOCASE ASC`;
  if (sort === 'updated') return sql`${a}.updated_at DESC`;
  if (sort === 'lastInteraction')
    return sql`(li.last_at IS NULL), li.last_at DESC, ${a}.created_at DESC`;
  if (sort === 'priority') return sql`(${a}.priority IS NULL), ${a}.priority ASC, ${a}.created_at DESC`;
  if (sort === 'status') return sql`(${a}.status_id IS NULL), ${a}.status_id ASC, ${a}.created_at DESC`;
  return sql`${a}.created_at DESC`;
}

export function needsLastInteractionJoin(sort: string): boolean {
  return sort === 'lastInteraction';
}

/**
 * Detect "default unfiltered view" — only in this state is cursor pagination
 * valid for the API's Load More endpoint. Filtered/sorted/searched views ship
 * the first page and don't expose a cursor.
 */
export function isDefaultListView(f: ListFilters, tagIds: string[] | null): boolean {
  return (
    !f.fts &&
    !f.includeArchived &&
    !f.favorite &&
    !tagIds &&
    !f.priority &&
    !f.status &&
    f.sort === 'recent'
  );
}
