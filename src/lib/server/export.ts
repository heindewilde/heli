/**
 * The row shapes behind `/api/export`, kept out of the route so tests can call
 * them. The suite is server-side and calls helpers, never handlers — with these
 * shapes inlined in `+server.ts` there was nothing to assert against, which is
 * why the endpoint shipped without a single test.
 *
 * Two things are contracts rather than implementation details:
 *
 *  - **The header lists are the file format.** Somebody's spreadsheet, script or
 *    re-import depends on the column order, so they are constants pinned by
 *    `tests/export.test.ts`, not literals inlined at a call site.
 *  - **The projections are explicit.** Honouring `?q=` needs a JOIN onto the
 *    FTS table, which drizzle's query builder cannot express, so these queries
 *    are raw SQL — and raw SQL hands back snake_case keys where
 *    `d.select().from(people)` hands back camelCase. Aliasing every column here
 *    means the row shape cannot drift when the query form changes again.
 *
 * Tables are materialised rather than streamed. That is what the endpoint
 * already did (every branch `await`s the full result before `csvStream` iterates
 * it); filtered and id-limited exports are strictly smaller than the
 * whole-workspace export that behaviour was written for.
 */

import { error } from '@sveltejs/kit';
import { sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import { isoDate } from './csv';
import { getCollection } from './collections';
import {
  PERSON_LIST,
  COMPANY_LIST,
  listClauses,
  listOrderClause,
  needsLastInteractionJoin,
  parseListFilters,
  resolveTagFilter,
  tagFilterIds,
  type ListFilters,
  type ListScope
} from './list-filters';
import { personLastInteractionJoin } from './people-rows';
import { companyLastInteractionJoin } from './companies-rows';
import { getTagsForEntities } from './tags';
import type { Scope } from './scope';

export type CsvTable = { header: readonly string[]; rows: (readonly unknown[])[] };

/**
 * A size budget, not a permission: the caller is a browser posting a selection,
 * and the ceiling is bind count and response size. Far above `MAX_BULK_IDS`
 * (200), which bounds *writes*.
 */
export const MAX_EXPORT_IDS = 5000;

/** One `IN (…)` per chunk. Same convention as `matchPeople` in calendar.ts. */
const ID_CHUNK = 200;

export const PEOPLE_HEADER = [
  'id', 'name', 'url', 'domain', 'handle', 'role', 'company_id', 'email', 'phone',
  'location', 'avatar_url', 'notes', 'tags', 'is_favorite', 'is_archived',
  'created_at', 'updated_at'
] as const;

export const COMPANIES_HEADER = [
  'id', 'name', 'url', 'domain', 'description', 'industry', 'location', 'logo_url',
  'notes', 'tags', 'is_favorite', 'is_archived', 'created_at', 'updated_at'
] as const;

/**
 * A collection holds people *and* companies, so its CSV is one file with a
 * leading `kind` column and the union of the two column sets. A row leaves the
 * columns that do not apply to its kind blank.
 *
 * Downstream consumers depend on this order forever — pinned by a test.
 */
export const COLLECTION_HEADER = [
  'kind',
  'id', 'name', 'url', 'domain', 'handle', 'role', 'company_id', 'email', 'phone',
  'location', 'avatar_url', 'description', 'industry', 'logo_url', 'notes', 'tags',
  'is_favorite', 'is_archived', 'created_at', 'updated_at'
] as const;

type PersonExportRow = {
  id: string; name: string; url: string | null; domain: string | null;
  handle: string | null; role: string | null; companyId: string | null;
  email: string | null; phone: string | null; location: string | null;
  avatarUrl: string | null; notes: string | null;
  isFavorite: number; isArchived: number; createdAt: number; updatedAt: number;
};

type CompanyExportRow = {
  id: string; name: string; url: string | null; domain: string | null;
  description: string | null; industry: string | null; location: string | null;
  logoUrl: string | null; notes: string | null;
  isFavorite: number; isArchived: number; createdAt: number; updatedAt: number;
};

const PERSON_COLS: SQL = sql`
  p.id, p.name, p.url, p.domain, p.handle, p.role,
  p.company_id AS companyId, p.email, p.phone, p.location,
  p.avatar_url AS avatarUrl, p.notes,
  p.is_favorite AS isFavorite, p.is_archived AS isArchived,
  p.created_at AS createdAt, p.updated_at AS updatedAt
`;

const COMPANY_COLS: SQL = sql`
  c.id, c.name, c.url, c.domain, c.description, c.industry, c.location,
  c.logo_url AS logoUrl, c.notes,
  c.is_favorite AS isFavorite, c.is_archived AS isArchived,
  c.created_at AS createdAt, c.updated_at AS updatedAt
`;

function tagCell(map: Map<string, { name: string }[]>, id: string): string {
  return (map.get(id) ?? []).map((t) => t.name).join('|');
}

function personCells(p: PersonExportRow, tags: string): unknown[] {
  return [
    p.id, p.name, p.url ?? '', p.domain ?? '', p.handle ?? '', p.role ?? '',
    p.companyId ?? '', p.email ?? '', p.phone ?? '', p.location ?? '',
    p.avatarUrl ?? '', p.notes ?? '', tags,
    p.isFavorite ? '1' : '0', p.isArchived ? '1' : '0',
    isoDate(p.createdAt), isoDate(p.updatedAt)
  ];
}

function companyCells(c: CompanyExportRow, tags: string): unknown[] {
  return [
    c.id, c.name, c.url ?? '', c.domain ?? '', c.description ?? '', c.industry ?? '',
    c.location ?? '', c.logoUrl ?? '', c.notes ?? '', tags,
    c.isFavorite ? '1' : '0', c.isArchived ? '1' : '0',
    isoDate(c.createdAt), isoDate(c.updatedAt)
  ];
}

/**
 * Either the filters a user can see in the URL, or an explicit id list from a
 * tick-box selection. Never both — a selection is already the answer.
 */
/**
 * Filters for an export, which differ from the list page's in exactly one way.
 *
 * A list page has a default: no `archived` param means "hide the archived
 * ones", because that is what the rows on screen do. A *bare API URL* has no
 * such context — `/api/export?kind=people` has meant "the whole library" since
 * it was written, and it is what a bookmark, a cron backup or somebody's script
 * is pointed at. Letting the page's default leak onto it made those quietly
 * return fewer rows, with no error and nothing to notice.
 *
 * So the pages now always send an explicit `archived=0|1`, and an absent param
 * means everything. `tests/export.test.ts` pins both halves.
 */
export function parseExportFilters(params: URLSearchParams): ListFilters {
  const flt = parseListFilters(params);
  if (!params.has('archived')) flt.includeArchived = true;
  return flt;
}

export type ExportSelector =
  | { by: 'filters'; params: URLSearchParams }
  | { by: 'ids'; ids: string[] };

/** Chunked `IN (…)`, workspace-scoped. Ids the workspace does not own resolve
 *  to nothing rather than raising — a selection goes stale between the tick and
 *  the click, the same contract the bulk endpoints state. */
async function selectByIds<T>(
  s: Scope,
  cols: SQL,
  from: SQL,
  alias: 'p' | 'c',
  ids: string[]
): Promise<T[]> {
  const a = sql.raw(alias);
  const out: T[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const batch = unique.slice(i, i + ID_CHUNK);
    const rows = await db(s.region).all<T>(sql`
      SELECT ${cols} FROM ${from}
      WHERE ${a}.workspace_id = ${s.workspaceId}
        AND ${a}.id IN (${sql.join(batch.map((id) => sql`${id}`), sql`, `)})
      ORDER BY ${a}.created_at DESC
    `);
    out.push(...rows);
  }
  // Sorted here rather than relying on the per-chunk ORDER BY: with 300 ticked
  // rows the CSV would otherwise restart at the newest record every 200 lines,
  // which reads as corrupted output rather than as chunking.
  return out.sort(
    (x, y) => (y as { createdAt: number }).createdAt - (x as { createdAt: number }).createdAt
  );
}

async function selectByFilters<T>(
  s: Scope,
  sc: ListScope,
  cols: SQL,
  table: SQL,
  ftsTable: SQL,
  join: SQL,
  flt: ListFilters,
  tagIds: string[] | null
): Promise<T[]> {
  const cl = listClauses(sc, flt, tagIds);
  const a = sql.raw(sc.alias);
  if (flt.fts) {
    return db(s.region).all<T>(sql`
      SELECT ${cols} FROM ${table}
      JOIN ${ftsTable} f ON f.rowid = ${a}.rowid
      WHERE ${a}.workspace_id = ${s.workspaceId}
        AND f.${ftsTable} MATCH ${flt.fts}
        ${cl.archived} ${cl.favorite} ${cl.tagIn} ${cl.priority} ${cl.status}
      ORDER BY rank
    `);
  }
  return db(s.region).all<T>(sql`
    SELECT ${cols} FROM ${table}
    ${needsLastInteractionJoin(flt.sort) ? join : sql``}
    WHERE ${a}.workspace_id = ${s.workspaceId}
      ${cl.archived} ${cl.favorite} ${cl.tagIn} ${cl.priority} ${cl.status}
    ORDER BY ${listOrderClause(sc, flt.sort)}
  `);
}

export async function peopleExportTable(s: Scope, sel: ExportSelector): Promise<CsvTable> {
  let rows: PersonExportRow[];
  if (sel.by === 'ids') {
    rows = await selectByIds<PersonExportRow>(s, PERSON_COLS, sql`people p`, 'p', sel.ids);
  } else {
    const flt = parseExportFilters(sel.params);
    const tagRes = await resolveTagFilter(s, PERSON_LIST, flt);
    // A tag that exists with no members means an empty file, not the workspace.
    if (tagRes.kind === 'tag' && tagRes.ids.length === 0) {
      return { header: PEOPLE_HEADER, rows: [] };
    }
    rows = await selectByFilters<PersonExportRow>(
      s, PERSON_LIST, PERSON_COLS, sql`people p`, sql.raw('people_fts'),
      personLastInteractionJoin(s.workspaceId), flt, tagFilterIds(tagRes)
    );
  }
  const tagMap = await getTagsForEntities(s, 'person', rows.map((r) => r.id));
  return { header: PEOPLE_HEADER, rows: rows.map((p) => personCells(p, tagCell(tagMap, p.id))) };
}

export async function companiesExportTable(s: Scope, sel: ExportSelector): Promise<CsvTable> {
  let rows: CompanyExportRow[];
  if (sel.by === 'ids') {
    rows = await selectByIds<CompanyExportRow>(s, COMPANY_COLS, sql`companies c`, 'c', sel.ids);
  } else {
    const flt = parseExportFilters(sel.params);
    const tagRes = await resolveTagFilter(s, COMPANY_LIST, flt);
    if (tagRes.kind === 'tag' && tagRes.ids.length === 0) {
      return { header: COMPANIES_HEADER, rows: [] };
    }
    rows = await selectByFilters<CompanyExportRow>(
      s, COMPANY_LIST, COMPANY_COLS, sql`companies c`, sql.raw('companies_fts'),
      companyLastInteractionJoin(s.workspaceId), flt, tagFilterIds(tagRes)
    );
  }
  const tagMap = await getTagsForEntities(s, 'company', rows.map((r) => r.id));
  return { header: COMPANIES_HEADER, rows: rows.map((c) => companyCells(c, tagCell(tagMap, c.id))) };
}

/**
 * How many rows a filtered export would produce.
 *
 * The list pages cannot work this out themselves: `data.total` counts the
 * unarchived workspace, and the rendered rows stop at the page size, so a
 * filtered view has no count on the client at all. The Export preview needs one
 * — telling somebody "this will export some people" is not a preview.
 *
 * Deliberately a COUNT rather than reusing the row query: the preview runs on
 * every click of the button, and building the whole CSV to measure it would be
 * the expensive way to render a number.
 */
export async function exportCount(
  s: Scope,
  sc: ListScope,
  params: URLSearchParams
): Promise<number> {
  const flt = parseExportFilters(params);
  const tagRes = await resolveTagFilter(s, sc, flt);
  if (tagRes.kind === 'tag' && tagRes.ids.length === 0) return 0;

  const cl = listClauses(sc, flt, tagFilterIds(tagRes));
  const a = sql.raw(sc.alias);
  const table = sc.entity === 'person' ? sql`people p` : sql`companies c`;
  const ftsTable = sql.raw(sc.ftsTable);

  const row = flt.fts
    ? await db(s.region).get<{ n: number }>(sql`
        SELECT COUNT(*) AS n FROM ${table}
        JOIN ${ftsTable} f ON f.rowid = ${a}.rowid
        WHERE ${a}.workspace_id = ${s.workspaceId}
          AND f.${ftsTable} MATCH ${flt.fts}
          ${cl.archived} ${cl.favorite} ${cl.tagIn} ${cl.priority} ${cl.status}
      `)
    : await db(s.region).get<{ n: number }>(sql`
        SELECT COUNT(*) AS n FROM ${table}
        WHERE ${a}.workspace_id = ${s.workspaceId}
          ${cl.archived} ${cl.favorite} ${cl.tagIn} ${cl.priority} ${cl.status}
      `);
  return Number(row?.n ?? 0);
}

export type CollectionMembers = 'all' | 'people' | 'companies';

export function parseCollectionMembers(raw: string | null): CollectionMembers {
  return raw === 'people' || raw === 'companies' ? raw : 'all';
}

/**
 * One merged table. Rows come out in the collection's own `addedAt DESC` order
 * with people and companies interleaved, so the CSV reads in the same order as
 * the page rather than in two blocks the page never shows.
 *
 * Deliberately not built on `getCollectionDetail`: its member shape carries the
 * page's card furniture and none of the export columns, and widening it would
 * ship those columns to every `/api/v1/collections/[id]` consumer forever.
 */
export async function collectionExportTable(
  s: Scope,
  collectionId: string,
  members: CollectionMembers
): Promise<{ table: CsvTable; name: string }> {
  const collection = await getCollection(s, collectionId);
  if (!collection) throw error(404, 'not_found');

  const wanted = collection.members.filter(
    (m) => members === 'all' || (members === 'people' ? m.kind === 'person' : m.kind === 'company')
  );
  const personIds = wanted.filter((m) => m.kind === 'person').map((m) => m.id);
  const companyIds = wanted.filter((m) => m.kind === 'company').map((m) => m.id);

  const [personRows, companyRows, personTagMap, companyTagMap] = await Promise.all([
    personIds.length
      ? selectByIds<PersonExportRow>(s, PERSON_COLS, sql`people p`, 'p', personIds)
      : Promise.resolve([]),
    companyIds.length
      ? selectByIds<CompanyExportRow>(s, COMPANY_COLS, sql`companies c`, 'c', companyIds)
      : Promise.resolve([]),
    getTagsForEntities(s, 'person', personIds),
    getTagsForEntities(s, 'company', companyIds)
  ]);

  const peopleById = new Map(personRows.map((p) => [p.id, p]));
  const companiesById = new Map(companyRows.map((c) => [c.id, c]));

  // Written out column by column against COLLECTION_HEADER rather than spliced
  // from the single-kind row builders: the whole point of the merged file is
  // that a person and a company land in the same columns, and an off-by-one
  // here would be a silently mis-shifted CSV rather than an error.
  const rows: (readonly unknown[])[] = [];
  for (const m of wanted) {
    if (m.kind === 'person') {
      const p = peopleById.get(m.id);
      if (!p) continue;
      rows.push([
        'person',
        p.id, p.name, p.url ?? '', p.domain ?? '',
        p.handle ?? '', p.role ?? '', p.companyId ?? '', p.email ?? '', p.phone ?? '',
        p.location ?? '', p.avatarUrl ?? '',
        '', '', '',                                   // description, industry, logo_url
        p.notes ?? '', tagCell(personTagMap, p.id),
        p.isFavorite ? '1' : '0', p.isArchived ? '1' : '0',
        isoDate(p.createdAt), isoDate(p.updatedAt)
      ]);
    } else {
      const c = companiesById.get(m.id);
      if (!c) continue;
      rows.push([
        'company',
        c.id, c.name, c.url ?? '', c.domain ?? '',
        '', '', '', '', '',                           // handle, role, company_id, email, phone
        c.location ?? '', '',                         // location, avatar_url
        c.description ?? '', c.industry ?? '', c.logoUrl ?? '',
        c.notes ?? '', tagCell(companyTagMap, c.id),
        c.isFavorite ? '1' : '0', c.isArchived ? '1' : '0',
        isoDate(c.createdAt), isoDate(c.updatedAt)
      ]);
    }
  }

  return { table: { header: COLLECTION_HEADER, rows }, name: collection.name };
}

/** Mirrors `parseBulkBody`: same forgiving-but-bounded contract. */
export function parseExportBody(raw: unknown): { kind: 'people' | 'companies'; ids: string[] } {
  const body = raw as { kind?: unknown; ids?: unknown };
  if (body?.kind !== 'people' && body?.kind !== 'companies') throw error(400, 'invalid_kind');
  if (!Array.isArray(body.ids)) throw error(400, 'missing_ids');
  const ids = [...new Set(body.ids.filter((v): v is string => typeof v === 'string' && !!v))];
  if (ids.length === 0) throw error(400, 'missing_ids');
  if (ids.length > MAX_EXPORT_IDS) throw error(400, 'too_many_ids');
  return { kind: body.kind, ids };
}
