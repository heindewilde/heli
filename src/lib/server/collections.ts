import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
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
import { sanitizePlainText } from './sanitize';
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

export type CollectionDetail = Collection & {
  members: CollectionMember[];
};

export async function getCollection(
  s: Scope,
  id: string
): Promise<CollectionDetail | null> {
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

  const [peopleRows, companyRows] = await Promise.all([
    personIds.length > 0
      ? d
          .select({
            id: people.id,
            name: people.name,
            role: people.role,
            avatarUrl: people.avatarUrl
          })
          .from(people)
          .where(and(eq(people.workspaceId, s.workspaceId), inArray(people.id, personIds)))
      : Promise.resolve([] as { id: string; name: string; role: string | null; avatarUrl: string | null }[]),
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
      : Promise.resolve([] as { id: string; name: string; logoUrl: string | null; faviconUrl: string | null; domain: string | null }[])
  ]);

  const peopleMap = new Map(peopleRows.map((p) => [p.id, p]));
  const companyMap = new Map(companyRows.map((c) => [c.id, c]));

  const members: CollectionMember[] = [];
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
        avatarUrl: p.avatarUrl
      });
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
        domain: c.domain
      });
    }
  }

  return { ...collection, members };
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
  const description = input.description ? sanitizePlainText(input.description, 1000) : null;
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
    updates.description = input.description
      ? sanitizePlainText(input.description, 1000) || null
      : null;
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
