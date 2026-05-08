import { and, eq, inArray } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import { interactions, interactionPeople, interactionProjects, people, companies, projects } from './schema';
import { sanitize, sanitizePlainText } from './sanitize';
import { INTERACTION_TYPES, isInteractionType, type InteractionType } from '$lib/interactions';

export { INTERACTION_TYPES, isInteractionType };
export type { InteractionType };

export type InteractionInput = {
  occurredAt: number;
  type: InteractionType;
  title: string;
  body?: string | null;
  companyId?: string | null;
  personIds?: string[];
  projectIds?: string[];
};

async function validatePeopleIds(userId: string, region: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db(region)
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.userId, userId), inArray(people.id, ids)));
  return rows.map((r) => r.id);
}

async function validateCompanyId(userId: string, region: string, id: string): Promise<string | null> {
  const row = await db(region)
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.userId, userId), eq(companies.id, id)))
    .get();
  return row?.id ?? null;
}

async function validateProjectIds(userId: string, region: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db(region)
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, userId), inArray(projects.id, ids)));
  return rows.map((r) => r.id);
}

export async function createInteraction(
  userId: string,
  region: string,
  input: InteractionInput
): Promise<{ id: string }> {
  const id = createId();
  const now = Date.now();
  const title = sanitizePlainText(String(input.title ?? ''), 200);
  if (!title) throw new Error('missing_title');
  if (!isInteractionType(input.type)) throw new Error('invalid_type');
  const occurredAt = Number.isFinite(input.occurredAt) ? Math.floor(input.occurredAt) : now;
  const body = input.body ? sanitize(input.body) : null;
  const companyId = input.companyId
    ? await validateCompanyId(userId, region, input.companyId)
    : null;
  const personIds = input.personIds
    ? await validatePeopleIds(userId, region, input.personIds)
    : [];
  const projectIds = input.projectIds
    ? await validateProjectIds(userId, region, input.projectIds)
    : [];

  const d = db(region);
  await d.insert(interactions).values({
    id,
    userId,
    occurredAt,
    type: input.type,
    title,
    body,
    companyId,
    createdAt: now,
    updatedAt: now
  });
  if (personIds.length > 0) {
    await d.insert(interactionPeople).values(personIds.map((pid) => ({ interactionId: id, personId: pid })));
  }
  if (projectIds.length > 0) {
    await d
      .insert(interactionProjects)
      .values(projectIds.map((projectId) => ({ interactionId: id, projectId })));
  }
  return { id };
}

export async function updateInteraction(
  userId: string,
  region: string,
  id: string,
  patch: Partial<InteractionInput>
): Promise<void> {
  const d = db(region);
  const existing = await d
    .select({ id: interactions.id })
    .from(interactions)
    .where(and(eq(interactions.id, id), eq(interactions.userId, userId)))
    .get();
  if (!existing) throw new Error('not_found');

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (patch.title !== undefined) {
    const title = sanitizePlainText(String(patch.title), 200);
    if (!title) throw new Error('missing_title');
    updates.title = title;
  }
  if (patch.type !== undefined) {
    if (!isInteractionType(patch.type)) throw new Error('invalid_type');
    updates.type = patch.type;
  }
  if (patch.body !== undefined) updates.body = patch.body ? sanitize(patch.body) : null;
  if (patch.occurredAt !== undefined && Number.isFinite(patch.occurredAt)) {
    updates.occurredAt = Math.floor(patch.occurredAt);
  }
  if (patch.companyId !== undefined) {
    updates.companyId = patch.companyId
      ? await validateCompanyId(userId, region, patch.companyId)
      : null;
  }
  await d
    .update(interactions)
    .set(updates)
    .where(and(eq(interactions.id, id), eq(interactions.userId, userId)));

  if (patch.personIds !== undefined) {
    const valid = await validatePeopleIds(userId, region, patch.personIds);
    await d.delete(interactionPeople).where(eq(interactionPeople.interactionId, id));
    if (valid.length > 0) {
      await d
        .insert(interactionPeople)
        .values(valid.map((pid) => ({ interactionId: id, personId: pid })));
    }
  }
  if (patch.projectIds !== undefined) {
    const valid = await validateProjectIds(userId, region, patch.projectIds);
    await d.delete(interactionProjects).where(eq(interactionProjects.interactionId, id));
    if (valid.length > 0) {
      await d
        .insert(interactionProjects)
        .values(valid.map((projectId) => ({ interactionId: id, projectId })));
    }
  }
}

export async function deleteInteraction(userId: string, region: string, id: string): Promise<void> {
  await db(region)
    .delete(interactions)
    .where(and(eq(interactions.id, id), eq(interactions.userId, userId)));
}

export async function attachPerson(
  userId: string,
  region: string,
  interactionId: string,
  personId: string
): Promise<void> {
  const d = db(region);
  const owns = await d
    .select({ id: interactions.id })
    .from(interactions)
    .where(and(eq(interactions.id, interactionId), eq(interactions.userId, userId)))
    .get();
  if (!owns) throw new Error('not_found');
  const valid = await validatePeopleIds(userId, region, [personId]);
  if (valid.length === 0) throw new Error('person_not_found');
  // INSERT OR IGNORE behavior: composite PK collides — Drizzle exposes onConflictDoNothing.
  await d
    .insert(interactionPeople)
    .values({ interactionId, personId })
    .onConflictDoNothing();
}

export async function detachPerson(
  userId: string,
  region: string,
  interactionId: string,
  personId: string
): Promise<void> {
  const d = db(region);
  const owns = await d
    .select({ id: interactions.id })
    .from(interactions)
    .where(and(eq(interactions.id, interactionId), eq(interactions.userId, userId)))
    .get();
  if (!owns) throw new Error('not_found');
  await d
    .delete(interactionPeople)
    .where(
      and(eq(interactionPeople.interactionId, interactionId), eq(interactionPeople.personId, personId))
    );
}
