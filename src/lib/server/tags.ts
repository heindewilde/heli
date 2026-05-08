import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import {
  TAG_SCOPES,
  type TagScope,
  tags,
  personTags,
  companyTags,
  interactionTags,
  projectTags,
  people,
  companies,
  interactions,
  projects
} from './schema';
import { sanitizePlainText } from './sanitize';

export function isTagScope(v: unknown): v is TagScope {
  return typeof v === 'string' && (TAG_SCOPES as readonly string[]).includes(v);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

const JOIN_TABLE = {
  person: { table: personTags, ref: personTags.personId },
  company: { table: companyTags, ref: companyTags.companyId },
  interaction: { table: interactionTags, ref: interactionTags.interactionId },
  project: { table: projectTags, ref: projectTags.projectId }
} as const;

const ENTITY_TABLE = {
  person: { table: people, idCol: people.id, userCol: people.userId },
  company: { table: companies, idCol: companies.id, userCol: companies.userId },
  interaction: { table: interactions, idCol: interactions.id, userCol: interactions.userId },
  project: { table: projects, idCol: projects.id, userCol: projects.userId }
} as const;

export type TagWithCount = { id: string; name: string; slug: string; scope: TagScope; count: number };

export async function listTagsWithCounts(
  userId: string,
  region: string,
  scope: TagScope
): Promise<TagWithCount[]> {
  const d = db(region);
  const join = JOIN_TABLE[scope];
  const rows = await d
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      count: sql<number>`COUNT(${join.ref})`
    })
    .from(tags)
    .leftJoin(join.table, eq(join.table.tagId, tags.id))
    .where(and(eq(tags.userId, userId), eq(tags.scope, scope)))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));
  return rows.map((r) => ({ ...r, scope, count: Number(r.count) }));
}

async function ensureEntity(
  userId: string,
  region: string,
  scope: TagScope,
  entityId: string
): Promise<boolean> {
  const d = db(region);
  const meta = ENTITY_TABLE[scope];
  const found = await d
    .select({ id: meta.idCol })
    .from(meta.table)
    .where(and(eq(meta.idCol, entityId), eq(meta.userCol, userId)))
    .get();
  return !!found;
}

export async function ensureTag(
  userId: string,
  region: string,
  scope: TagScope,
  rawName: string
): Promise<{ id: string; name: string; slug: string; scope: TagScope }> {
  const d = db(region);
  const name = sanitizePlainText(rawName, 64);
  if (!name) throw new Error('missing_name');
  const slug = slugify(name);
  if (!slug) throw new Error('invalid_name');

  const existing = await d
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.scope, scope), eq(tags.slug, slug)))
    .get();
  if (existing) return { id: existing.id, name: existing.name, slug: existing.slug, scope };

  const id = createId();
  await d.insert(tags).values({ id, userId, name, slug, scope });
  return { id, name, slug, scope };
}

export async function attachTag(
  userId: string,
  region: string,
  scope: TagScope,
  entityId: string,
  tagId: string
): Promise<void> {
  const d = db(region);
  if (!(await ensureEntity(userId, region, scope, entityId))) throw new Error('not_found');
  // Confirm the tag belongs to this user and scope.
  const tag = await d
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId), eq(tags.scope, scope)))
    .get();
  if (!tag) throw new Error('not_found');
  if (scope === 'person') {
    await d.insert(personTags).values({ personId: entityId, tagId }).onConflictDoNothing();
  } else if (scope === 'company') {
    await d.insert(companyTags).values({ companyId: entityId, tagId }).onConflictDoNothing();
  } else if (scope === 'interaction') {
    await d.insert(interactionTags).values({ interactionId: entityId, tagId }).onConflictDoNothing();
  } else {
    await d.insert(projectTags).values({ projectId: entityId, tagId }).onConflictDoNothing();
  }
}

export async function detachTag(
  userId: string,
  region: string,
  scope: TagScope,
  entityId: string,
  tagId: string
): Promise<void> {
  const d = db(region);
  if (!(await ensureEntity(userId, region, scope, entityId))) throw new Error('not_found');
  if (scope === 'person') {
    await d
      .delete(personTags)
      .where(and(eq(personTags.personId, entityId), eq(personTags.tagId, tagId)));
  } else if (scope === 'company') {
    await d
      .delete(companyTags)
      .where(and(eq(companyTags.companyId, entityId), eq(companyTags.tagId, tagId)));
  } else if (scope === 'interaction') {
    await d
      .delete(interactionTags)
      .where(and(eq(interactionTags.interactionId, entityId), eq(interactionTags.tagId, tagId)));
  } else {
    await d
      .delete(projectTags)
      .where(and(eq(projectTags.projectId, entityId), eq(projectTags.tagId, tagId)));
  }
}

export async function deleteTag(
  userId: string,
  region: string,
  tagId: string
): Promise<void> {
  const d = db(region);
  await d.delete(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
}

export type EntityTag = { id: string; name: string; slug: string };

export async function getTagsForEntity(
  userId: string,
  region: string,
  scope: TagScope,
  entityId: string
): Promise<EntityTag[]> {
  const d = db(region);
  if (scope === 'person') {
    return d
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(personTags)
      .innerJoin(tags, eq(tags.id, personTags.tagId))
      .where(and(eq(personTags.personId, entityId), eq(tags.userId, userId)))
      .orderBy(asc(tags.name));
  }
  if (scope === 'company') {
    return d
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(companyTags)
      .innerJoin(tags, eq(tags.id, companyTags.tagId))
      .where(and(eq(companyTags.companyId, entityId), eq(tags.userId, userId)))
      .orderBy(asc(tags.name));
  }
  if (scope === 'interaction') {
    return d
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(interactionTags)
      .innerJoin(tags, eq(tags.id, interactionTags.tagId))
      .where(and(eq(interactionTags.interactionId, entityId), eq(tags.userId, userId)))
      .orderBy(asc(tags.name));
  }
  return d
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(projectTags)
    .innerJoin(tags, eq(tags.id, projectTags.tagId))
    .where(and(eq(projectTags.projectId, entityId), eq(tags.userId, userId)))
    .orderBy(asc(tags.name));
}

export async function getTagsForEntities(
  userId: string,
  region: string,
  scope: TagScope,
  entityIds: string[]
): Promise<Map<string, EntityTag[]>> {
  const out = new Map<string, EntityTag[]>();
  if (entityIds.length === 0) return out;
  const d = db(region);
  let rows: Array<{ entityId: string; id: string; name: string; slug: string }>;
  if (scope === 'person') {
    rows = await d
      .select({
        entityId: personTags.personId,
        id: tags.id,
        name: tags.name,
        slug: tags.slug
      })
      .from(personTags)
      .innerJoin(tags, eq(tags.id, personTags.tagId))
      .where(and(eq(tags.userId, userId), inArray(personTags.personId, entityIds)));
  } else if (scope === 'company') {
    rows = await d
      .select({
        entityId: companyTags.companyId,
        id: tags.id,
        name: tags.name,
        slug: tags.slug
      })
      .from(companyTags)
      .innerJoin(tags, eq(tags.id, companyTags.tagId))
      .where(and(eq(tags.userId, userId), inArray(companyTags.companyId, entityIds)));
  } else if (scope === 'interaction') {
    rows = await d
      .select({
        entityId: interactionTags.interactionId,
        id: tags.id,
        name: tags.name,
        slug: tags.slug
      })
      .from(interactionTags)
      .innerJoin(tags, eq(tags.id, interactionTags.tagId))
      .where(and(eq(tags.userId, userId), inArray(interactionTags.interactionId, entityIds)));
  } else {
    rows = await d
      .select({
        entityId: projectTags.projectId,
        id: tags.id,
        name: tags.name,
        slug: tags.slug
      })
      .from(projectTags)
      .innerJoin(tags, eq(tags.id, projectTags.tagId))
      .where(and(eq(tags.userId, userId), inArray(projectTags.projectId, entityIds)));
  }
  for (const r of rows) {
    const list = out.get(r.entityId) ?? [];
    list.push({ id: r.id, name: r.name, slug: r.slug });
    out.set(r.entityId, list);
  }
  return out;
}

export async function findTagBySlug(
  userId: string,
  region: string,
  scope: TagScope,
  slug: string
): Promise<{ id: string; name: string; slug: string; scope: TagScope } | null> {
  const d = db(region);
  const t = await d
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.scope, scope), eq(tags.slug, slug)))
    .get();
  if (!t) return null;
  return { id: t.id, name: t.name, slug: t.slug, scope };
}

export async function entityIdsForTag(
  userId: string,
  region: string,
  scope: TagScope,
  tagId: string
): Promise<string[]> {
  const d = db(region);
  if (scope === 'person') {
    const rows = await d
      .select({ id: personTags.personId })
      .from(personTags)
      .innerJoin(tags, eq(tags.id, personTags.tagId))
      .where(and(eq(personTags.tagId, tagId), eq(tags.userId, userId)));
    return rows.map((r) => r.id);
  }
  if (scope === 'company') {
    const rows = await d
      .select({ id: companyTags.companyId })
      .from(companyTags)
      .innerJoin(tags, eq(tags.id, companyTags.tagId))
      .where(and(eq(companyTags.tagId, tagId), eq(tags.userId, userId)));
    return rows.map((r) => r.id);
  }
  if (scope === 'interaction') {
    const rows = await d
      .select({ id: interactionTags.interactionId })
      .from(interactionTags)
      .innerJoin(tags, eq(tags.id, interactionTags.tagId))
      .where(and(eq(interactionTags.tagId, tagId), eq(tags.userId, userId)));
    return rows.map((r) => r.id);
  }
  const rows = await d
    .select({ id: projectTags.projectId })
    .from(projectTags)
    .innerJoin(tags, eq(tags.id, projectTags.tagId))
    .where(and(eq(projectTags.tagId, tagId), eq(tags.userId, userId)));
  return rows.map((r) => r.id);
}
