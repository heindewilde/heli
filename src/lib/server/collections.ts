import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import {
  collections,
  collectionItems,
  people,
  companies,
  type Collection,
  type MemberKind
} from './schema';
import { ftsQuery } from './search';
import { getTagsForEntities, type EntityTag } from './tags';
import { sanitize, sanitizePlainText } from './sanitize';
import { getCollectionSync } from './sync';
import { addManyToPipeline } from './pipelines';
import type { Scope } from './scope';

export type CollectionListRow = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  isArchived: number;
  createdAt: number;
  updatedAt: number;
  memberCount: number;
  peopleCount: number;
  companyCount: number;
};

export type CollectionListFilters = {
  q?: string;
  archived?: 'active' | 'archived' | 'all';
  sort?: 'updated' | 'recent' | 'name';
  limit?: number;
};

export async function listCollections(
  s: Scope,
  filters: CollectionListFilters = {}
): Promise<CollectionListRow[]> {
  const d = db(s.region);
  const limit = Math.min(filters.limit ?? 200, 500);
  const fts = filters.q ? ftsQuery(filters.q) : null;
  const archived = filters.archived ?? 'active';

  const archivedClause =
    archived === 'all'
      ? sql``
      : archived === 'archived'
        ? sql`AND c.is_archived = 1`
        : sql`AND c.is_archived = 0`;

  const ftsClause = fts
    ? sql`AND c.id IN (
        SELECT cc.id FROM collections cc
        JOIN collections_fts f ON f.rowid = cc.rowid
        WHERE cc.workspace_id = ${s.workspaceId} AND f.collections_fts MATCH ${fts}
      )`
    : sql``;

  const sort = filters.sort ?? 'updated';
  const orderClause =
    sort === 'name'
      ? sql`ORDER BY c.name ASC`
      : sort === 'recent'
        ? sql`ORDER BY c.created_at DESC`
        : sql`ORDER BY c.updated_at DESC`;

  const rows = await d.all<CollectionListRow>(sql`
    SELECT
      c.id, c.name, c.description, c.icon,
      c.is_archived AS isArchived,
      c.created_at AS createdAt, c.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM collection_items WHERE collection_id = c.id) AS memberCount,
      (SELECT COUNT(*) FROM collection_items WHERE collection_id = c.id AND kind = 'person') AS peopleCount,
      (SELECT COUNT(*) FROM collection_items WHERE collection_id = c.id AND kind = 'company') AS companyCount
    FROM collections c
    WHERE c.workspace_id = ${s.workspaceId}
      ${archivedClause}
      ${ftsClause}
    ${orderClause}
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    ...r,
    icon: r.icon ?? null,
    isArchived: Number(r.isArchived ?? 0),
    memberCount: Number(r.memberCount ?? 0),
    peopleCount: Number(r.peopleCount ?? 0),
    companyCount: Number(r.companyCount ?? 0)
  }));
}

export type CollectionMember = {
  kind: MemberKind;
  id: string;
  name: string;
  addedAt: number;
  // Person fields
  role?: string | null;
  avatarUrl?: string | null;
  // Company fields
  logoUrl?: string | null;
  faviconUrl?: string | null;
  domain?: string | null;
};

/**
 * A member plus the decoration the collection detail page's cards render.
 *
 * Deliberately a separate type from `CollectionMember`, because that one is the
 * response body of `GET /api/v1/collections/[id]` and `POST /[id]/items` —
 * anything added to it ships to every API consumer forever. The company columns
 * and the tags are page furniture, not part of the collection resource.
 */
export type CollectionMemberDetail = CollectionMember & {
  // Person fields, from the LEFT JOIN onto the person's company. Only what the
  // page actually renders: the card's subtitle is `role · companyName`, and the
  // id is what a link would need. The company's logo and domain are deliberately
  // not carried — nothing draws them, and this array is one row per member.
  companyId?: string | null;
  companyName?: string | null;
  tags: EntityTag[];
};

export type CollectionDetail = Collection & {
  members: CollectionMember[];
};

export type CollectionDetailRich = Collection & {
  members: CollectionMemberDetail[];
};

/**
 * The one implementation behind `getCollection` and `getCollectionDetail`.
 *
 * Three waves, and it stays three in both modes: the collection row, then the
 * membership rows, then a single `Promise.all` that hydrates people, companies
 * *and* both tag maps. The tags need ids that only exist after wave two, so
 * fetching them from the page load instead would make it four sequential round
 * trips — which against remote libSQL is the whole cost of this page.
 *
 * The company LEFT JOIN runs in both modes; one join on an indexed FK is free
 * and it keeps a single query builder here rather than two that must be kept in
 * step. What `detail` gates is only whether those columns and the tags are
 * *projected onto the member object*, so the v1 body is byte-identical to what
 * it was before the join existed. `tests/collections-detail.test.ts` pins that
 * key set, because it crosses the wire as `unknown` and no type checker sees it.
 */
async function loadCollection(
  s: Scope,
  id: string,
  opts: { detail: boolean }
): Promise<{ collection: Collection; members: CollectionMemberDetail[] } | null> {
  const d = db(s.region);
  const collection = await d
    .select()
    .from(collections)
    .where(and(eq(collections.id, id), eq(collections.workspaceId, s.workspaceId)))
    .get();
  if (!collection) return null;

  const items = await d
    .select({
      kind: collectionItems.kind,
      refId: collectionItems.refId,
      addedAt: collectionItems.addedAt
    })
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, id))
    .orderBy(desc(collectionItems.addedAt));

  const personIds = items.filter((i) => i.kind === 'person').map((i) => i.refId);
  const companyIds = items.filter((i) => i.kind === 'company').map((i) => i.refId);

  // `companies` is already the table of the sibling select below, so the join
  // needs an alias — same shape as `LEFT JOIN companies co` in people-rows.ts.
  const co = alias(companies, 'co');

  const [peopleRows, companyRows, personTagMap, companyTagMap] = await Promise.all([
    personIds.length > 0
      ? d
          .select({
            id: people.id,
            name: people.name,
            role: people.role,
            avatarUrl: people.avatarUrl,
            companyId: people.companyId,
            companyName: co.name
          })
          .from(people)
          // LEFT, never inner: an inner join drops every person with no company
          // and silently empties the page. The workspace predicate lives on the
          // join condition so the join is tenant-scoped on its own terms.
          .leftJoin(co, and(eq(co.id, people.companyId), eq(co.workspaceId, s.workspaceId)))
          .where(and(eq(people.workspaceId, s.workspaceId), inArray(people.id, personIds)))
      : Promise.resolve([] as PersonHydration[]),
    companyIds.length > 0
      ? d
          .select({
            id: companies.id,
            name: companies.name,
            logoUrl: companies.logoUrl,
            faviconUrl: companies.faviconUrl,
            domain: companies.domain
          })
          .from(companies)
          .where(and(eq(companies.workspaceId, s.workspaceId), inArray(companies.id, companyIds)))
      : Promise.resolve([] as CompanyHydration[]),
    // `getTagsForEntities` short-circuits on an empty array, so an all-people
    // collection never issues the company-tag query.
    opts.detail
      ? getTagsForEntities(s, 'person', personIds)
      : Promise.resolve(new Map<string, EntityTag[]>()),
    opts.detail
      ? getTagsForEntities(s, 'company', companyIds)
      : Promise.resolve(new Map<string, EntityTag[]>())
  ]);

  const peopleMap = new Map(peopleRows.map((p) => [p.id, p]));
  const companyMap = new Map(companyRows.map((c) => [c.id, c]));

  const members: CollectionMemberDetail[] = [];
  for (const item of items) {
    if (item.kind === 'person') {
      const p = peopleMap.get(item.refId);
      if (!p) continue;
      members.push({
        kind: 'person',
        id: p.id,
        name: p.name,
        addedAt: item.addedAt,
        role: p.role,
        avatarUrl: p.avatarUrl,
        ...(opts.detail
          ? {
              companyId: p.companyId,
              companyName: p.companyName,
              tags: personTagMap.get(p.id) ?? []
            }
          : {})
      } as CollectionMemberDetail);
    } else if (item.kind === 'company') {
      const c = companyMap.get(item.refId);
      if (!c) continue;
      members.push({
        kind: 'company',
        id: c.id,
        name: c.name,
        addedAt: item.addedAt,
        logoUrl: c.logoUrl,
        faviconUrl: c.faviconUrl,
        domain: c.domain,
        ...(opts.detail ? { tags: companyTagMap.get(c.id) ?? [] } : {})
      } as CollectionMemberDetail);
    }
  }

  return { collection, members };
}

type PersonHydration = {
  id: string;
  name: string;
  role: string | null;
  avatarUrl: string | null;
  companyId: string | null;
  companyName: string | null;
};

type CompanyHydration = {
  id: string;
  name: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  domain: string | null;
};

/** Membership only — this is the public `/api/v1` body. */
export async function getCollection(s: Scope, id: string): Promise<CollectionDetail | null> {
  const loaded = await loadCollection(s, id, { detail: false });
  return loaded && { ...loaded.collection, members: loaded.members };
}

/** Membership plus each member's company and tags. For the detail page only. */
export async function getCollectionDetail(
  s: Scope,
  id: string
): Promise<CollectionDetailRich | null> {
  const loaded = await loadCollection(s, id, { detail: true });
  return loaded && { ...loaded.collection, members: loaded.members };
}

export type ManualCollectionInput = {
  name: string;
  description?: string | null;
  icon?: string | null;
};

export async function createCollection(
  s: Scope,
  input: ManualCollectionInput
): Promise<{ id: string }> {
  const d = db(s.region);
  const name = sanitizePlainText(input.name, 200);
  if (!name) throw new Error('missing_name');
  // `sanitize`, not `sanitizePlainText`: this column is rendered with `{@html}`
  // by NotesEditor, and sanitizePlainText only strips control characters — it
  // neither escapes nor removes markup. Same invariant as `people.notes` and
  // `companies.description`, which already used the allowlist sanitizer.
  const description = input.description ? sanitize(input.description) : null;
  const icon = input.icon ? sanitizePlainText(input.icon, 50) : null;
  const id = createId();
  const now = Date.now();
  await d.insert(collections).values({
    id,
    workspaceId: s.workspaceId,
    userId: s.userId,
    name,
    description: description || null,
    icon: icon || null,
    isArchived: 0,
    createdAt: now,
    updatedAt: now
  });
  return { id };
}

export type UpdateCollectionInput = {
  name?: string;
  description?: string | null;
  icon?: string | null;
  isArchived?: boolean | 0 | 1;
};

export async function updateCollection(
  s: Scope,
  id: string,
  input: UpdateCollectionInput
): Promise<void> {
  const d = db(s.region);
  const updates: Partial<typeof collections.$inferInsert> = { updatedAt: Date.now() };
  if (input.name != null) {
    const next = sanitizePlainText(input.name, 200);
    if (!next) throw new Error('missing_name');
    updates.name = next;
  }
  if (input.description !== undefined) {
    updates.description = input.description ? sanitize(input.description) || null : null;
  }
  if (input.icon !== undefined) {
    updates.icon = input.icon ? sanitizePlainText(input.icon, 50) || null : null;
  }
  if (input.isArchived !== undefined) {
    updates.isArchived = input.isArchived ? 1 : 0;
  }
  await d
    .update(collections)
    .set(updates)
    .where(and(eq(collections.id, id), eq(collections.workspaceId, s.workspaceId)));
}

export async function deleteCollection(
  s: Scope,
  id: string
): Promise<void> {
  const d = db(s.region);
  await d
    .delete(collections)
    .where(and(eq(collections.id, id), eq(collections.workspaceId, s.workspaceId)));
}

/**
 * Add many members of both kinds and propagate to a synced pipeline.
 *
 * Extracted from the URL-import commit so the suite can reach it: the tests are
 * server-side and call helpers, never handlers, so logic that lives inside a
 * `+server.ts` is logic nothing can assert on.
 *
 * Chunked even though `addManyToCollection` is one multi-row insert per call:
 * it has only ever been driven by `bulk.ts`, which is capped at MAX_BULK_IDS
 * (200), and a 500-row paste would be a ~2,000-bind insert plus a 500-id
 * `inArray` inside its member filter.
 *
 * The pipeline sync is resolved **once** for the batch rather than per item,
 * matching `bulk.ts`. Failures here are swallowed: the records are already
 * written, and a missing board card is not worth losing an import to.
 */
export async function addManyAndSync(
  s: Scope,
  collectionId: string,
  byKind: { person: string[]; company: string[] },
  chunk = 100
): Promise<number> {
  const synced: { kind: MemberKind; refId: string }[] = [];
  let added = 0;
  for (const kind of ['person', 'company'] as const) {
    const list = byKind[kind];
    for (let i = 0; i < list.length; i += chunk) {
      try {
        const got = await addManyToCollection(s, collectionId, kind, list.slice(i, i + chunk));
        added += got.length;
        for (const refId of got) synced.push({ kind, refId });
      } catch {
        // Per chunk, not around the loop. A wrapping try turns one transient
        // failure into "the remaining chunks are never attempted and nothing
        // that already landed reaches the board" — which is worse than the
        // partial result it was meant to tolerate. A collection that does not
        // belong to this workspace simply fails every chunk and adds nothing.
      }
    }
  }

  const sync = await getCollectionSync(s, collectionId).catch(() => null);
  if (sync && synced.length > 0) {
    try {
      // One batched call, not one per item: `addItemToPipeline` is seven round
      // trips each, which a 500-row import turns into a proxy timeout on a
      // request whose rows have already been written.
      await addManyToPipeline(s, sync.pipelineId, synced, chunk);
    } catch {
      // The board was deleted or has no stages. The members are filed either
      // way, and a missing card is not worth failing an import over.
    }
  }
  return added;
}

/**
 * Name and id only. The URL-import stager needs to prove the collection is in
 * this workspace and to show its name on the review screen; loading the whole
 * membership list to learn two columns would be a needless round trip on a
 * path that is already doing chunked existence lookups.
 */
export async function getCollectionSummary(
  s: Scope,
  id: string
): Promise<{ id: string; name: string } | null> {
  const row = await db(s.region)
    .select({ id: collections.id, name: collections.name })
    .from(collections)
    .where(and(eq(collections.id, id), eq(collections.workspaceId, s.workspaceId)))
    .get();
  return row ?? null;
}

async function ensureCollectionOwned(
  d: ReturnType<typeof db>,
  workspaceId: string,
  collectionId: string
): Promise<boolean> {
  const found = await d
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.workspaceId, workspaceId)))
    .get();
  return !!found;
}

async function ensureMember(
  d: ReturnType<typeof db>,
  workspaceId: string,
  kind: MemberKind,
  refId: string
): Promise<boolean> {
  if (kind === 'person') {
    const r = await d
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.id, refId), eq(people.workspaceId, workspaceId)))
      .get();
    return !!r;
  }
  const r = await d
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, refId), eq(companies.workspaceId, workspaceId)))
    .get();
  return !!r;
}

/** The bulk sibling of `ensureMember`: one query instead of one per id. */
async function filterMembers(
  d: ReturnType<typeof db>,
  workspaceId: string,
  kind: MemberKind,
  refIds: string[]
): Promise<string[]> {
  if (refIds.length === 0) return [];
  if (kind === 'person') {
    const rows = await d
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.workspaceId, workspaceId), inArray(people.id, refIds)));
    return rows.map((r) => r.id);
  }
  const rows = await d
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.workspaceId, workspaceId), inArray(companies.id, refIds)));
  return rows.map((r) => r.id);
}

export async function addToCollection(
  s: Scope,
  collectionId: string,
  kind: MemberKind,
  refId: string
): Promise<void> {
  const d = db(s.region);
  if (!(await ensureCollectionOwned(d, s.workspaceId, collectionId))) throw new Error('not_found');
  if (!(await ensureMember(d, s.workspaceId, kind, refId))) throw new Error('not_found');
  await d
    .insert(collectionItems)
    .values({ collectionId, kind, refId, addedAt: Date.now() })
    .onConflictDoNothing();
  await d
    .update(collections)
    .set({ updatedAt: Date.now() })
    .where(eq(collections.id, collectionId));
}

export async function removeFromCollection(
  s: Scope,
  collectionId: string,
  kind: MemberKind,
  refId: string
): Promise<void> {
  const d = db(s.region);
  if (!(await ensureCollectionOwned(d, s.workspaceId, collectionId))) throw new Error('not_found');
  await d
    .delete(collectionItems)
    .where(
      and(
        eq(collectionItems.collectionId, collectionId),
        eq(collectionItems.kind, kind),
        eq(collectionItems.refId, refId)
      )
    );
  await d
    .update(collections)
    .set({ updatedAt: Date.now() })
    .where(eq(collections.id, collectionId));
}

/**
 * Add many members in one go.
 *
 * Not a loop over `addToCollection`: that resolves the collection *and* checks
 * each member's tenancy with its own round trip, so two hundred ticked rows
 * would be six hundred against remote libSQL. Here the collection is checked
 * once, the members are filtered with one `inArray` per kind, and the rows go
 * in as a single insert.
 *
 * Returns the ids that were actually resolvable in this workspace, so the
 * caller can propagate exactly those to a synced pipeline and report an honest
 * count. Ids from another workspace are dropped silently rather than raising —
 * a stale selection is not an error worth failing the whole action over.
 */
export async function addManyToCollection(
  s: Scope,
  collectionId: string,
  kind: MemberKind,
  refIds: string[]
): Promise<string[]> {
  const d = db(s.region);
  if (!(await ensureCollectionOwned(d, s.workspaceId, collectionId))) throw new Error('not_found');
  const valid = await filterMembers(d, s.workspaceId, kind, refIds);
  if (valid.length === 0) return [];
  const now = Date.now();
  await d
    .insert(collectionItems)
    .values(valid.map((refId) => ({ collectionId, kind, refId, addedAt: now })))
    .onConflictDoNothing();
  await d.update(collections).set({ updatedAt: now }).where(eq(collections.id, collectionId));
  return valid;
}

export async function removeManyFromCollection(
  s: Scope,
  collectionId: string,
  kind: MemberKind,
  refIds: string[]
): Promise<string[]> {
  const d = db(s.region);
  if (!(await ensureCollectionOwned(d, s.workspaceId, collectionId))) throw new Error('not_found');
  if (refIds.length === 0) return [];
  const now = Date.now();
  await d
    .delete(collectionItems)
    .where(
      and(
        eq(collectionItems.collectionId, collectionId),
        eq(collectionItems.kind, kind),
        inArray(collectionItems.refId, refIds)
      )
    );
  await d.update(collections).set({ updatedAt: now }).where(eq(collections.id, collectionId));
  return refIds;
}

export type CollectionMembershipForEntity = {
  id: string;
  name: string;
  icon: string | null;
  isArchived: number;
};

export async function listCollectionsForEntity(
  s: Scope,
  kind: MemberKind,
  refId: string
): Promise<CollectionMembershipForEntity[]> {
  const d = db(s.region);
  const rows = await d
    .select({
      id: collections.id,
      name: collections.name,
      icon: collections.icon,
      isArchived: collections.isArchived
    })
    .from(collectionItems)
    .innerJoin(collections, eq(collections.id, collectionItems.collectionId))
    .where(
      and(
        eq(collections.workspaceId, s.workspaceId),
        eq(collectionItems.kind, kind),
        eq(collectionItems.refId, refId)
      )
    )
    .orderBy(asc(collections.name));
  return rows.map((r) => ({
    ...r,
    icon: r.icon ?? null,
    isArchived: Number(r.isArchived ?? 0)
  }));
}

/** Lightweight typeahead for the CollectionPicker / CommandPalette. */
export async function searchCollections(
  s: Scope,
  q: string,
  limit = 8
): Promise<{ id: string; name: string; isArchived: number }[]> {
  const d = db(s.region);
  const fts = ftsQuery(q);
  if (!fts) {
    const rows = await d
      .select({ id: collections.id, name: collections.name, isArchived: collections.isArchived })
      .from(collections)
      .where(eq(collections.workspaceId, s.workspaceId))
      .orderBy(desc(collections.updatedAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, isArchived: Number(r.isArchived ?? 0) }));
  }
  const rows = await d.all<{ id: string; name: string; isArchived: number }>(sql`
    SELECT c.id, c.name, c.is_archived AS isArchived
    FROM collections c
    JOIN collections_fts f ON f.rowid = c.rowid
    WHERE c.workspace_id = ${s.workspaceId} AND f.collections_fts MATCH ${fts}
    ORDER BY rank
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ ...r, isArchived: Number(r.isArchived ?? 0) }));
}
