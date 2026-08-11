import { and, eq, inArray } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import { interactions, interactionPeople, interactionProjects, people, companies, projects } from './schema';
import { sanitize, sanitizePlainText } from './sanitize';
import {
  INTERACTION_TYPES,
  isInteractionType,
  type InteractionType
} from '$lib/interactionTypes';
import type { Scope } from './scope';
import { bumpSearchEpoch } from './search';

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
  /** Set when this was sent from an outreach template. Provenance only. */
  outreachTemplateId?: string | null;
};

/**
 * `title` has always been capped at 200; `body` was not capped at all.
 * Outreach makes that reachable — an X DM budget alone is 10k characters, and
 * a paste can be far larger — and every interaction body is indexed by FTS5.
 */
const MAX_BODY_LEN = 50_000;

async function validatePeopleIds(s: Scope, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db(s.region)
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.workspaceId, s.workspaceId), inArray(people.id, ids)));
  return rows.map((r) => r.id);
}

async function validateCompanyId(s: Scope, id: string): Promise<string | null> {
  const row = await db(s.region)
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.workspaceId, s.workspaceId), eq(companies.id, id)))
    .get();
  return row?.id ?? null;
}

async function validateProjectIds(s: Scope, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db(s.region)
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, s.workspaceId), inArray(projects.id, ids)));
  return rows.map((r) => r.id);
}

export async function createInteraction(
  s: Scope,
  input: InteractionInput
): Promise<{ id: string }> {
  const id = createId();
  const now = Date.now();
  const title = sanitizePlainText(String(input.title ?? ''), 200);
  if (!title) throw new Error('missing_title');
  if (!isInteractionType(input.type)) throw new Error('invalid_type');
  const occurredAt = Number.isFinite(input.occurredAt) ? Math.floor(input.occurredAt) : now;
  // Truncate before sanitizing, so a cut mid-tag is repaired rather than
  // stored: the column is rendered with `{@html}`.
  const body = input.body ? sanitize(input.body.slice(0, MAX_BODY_LEN)) : null;
  const companyId = input.companyId
    ? await validateCompanyId(s, input.companyId)
    : null;
  const personIds = input.personIds
    ? await validatePeopleIds(s, input.personIds)
    : [];
  const projectIds = input.projectIds
    ? await validateProjectIds(s, input.projectIds)
    : [];

  const d = db(s.region);
  await d.insert(interactions).values({
    id,
    workspaceId: s.workspaceId,
    userId: s.userId,
    occurredAt,
    type: input.type,
    title,
    body,
    companyId,
    outreachTemplateId: input.outreachTemplateId ?? null,
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
  bumpSearchEpoch(s.workspaceId);
  return { id };
}

export async function updateInteraction(
  s: Scope,
  id: string,
  patch: Partial<InteractionInput>
): Promise<void> {
  const d = db(s.region);
  const existing = await d
    .select({ id: interactions.id })
    .from(interactions)
    .where(and(eq(interactions.id, id), eq(interactions.workspaceId, s.workspaceId)))
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
      ? await validateCompanyId(s, patch.companyId)
      : null;
  }
  await d
    .update(interactions)
    .set(updates)
    .where(and(eq(interactions.id, id), eq(interactions.workspaceId, s.workspaceId)));

  if (patch.personIds !== undefined) {
    const valid = await validatePeopleIds(s, patch.personIds);
    await d.delete(interactionPeople).where(eq(interactionPeople.interactionId, id));
    if (valid.length > 0) {
      await d
        .insert(interactionPeople)
        .values(valid.map((pid) => ({ interactionId: id, personId: pid })));
    }
  }
  if (patch.projectIds !== undefined) {
    const valid = await validateProjectIds(s, patch.projectIds);
    await d.delete(interactionProjects).where(eq(interactionProjects.interactionId, id));
    if (valid.length > 0) {
      await d
        .insert(interactionProjects)
        .values(valid.map((projectId) => ({ interactionId: id, projectId })));
    }
  }
  bumpSearchEpoch(s.workspaceId);
}

export async function deleteInteraction(s: Scope, id: string): Promise<void> {
  await db(s.region)
    .delete(interactions)
    .where(and(eq(interactions.id, id), eq(interactions.workspaceId, s.workspaceId)));
  bumpSearchEpoch(s.workspaceId);
}

export async function attachPerson(
  s: Scope,
  interactionId: string,
  personId: string
): Promise<void> {
  const d = db(s.region);
  const owns = await d
    .select({ id: interactions.id })
    .from(interactions)
    .where(and(eq(interactions.id, interactionId), eq(interactions.workspaceId, s.workspaceId)))
    .get();
  if (!owns) throw new Error('not_found');
  const valid = await validatePeopleIds(s, [personId]);
  if (valid.length === 0) throw new Error('person_not_found');
  // INSERT OR IGNORE behavior: composite PK collides — Drizzle exposes onConflictDoNothing.
  await d
    .insert(interactionPeople)
    .values({ interactionId, personId })
    .onConflictDoNothing();
}

export async function detachPerson(
  s: Scope,
  interactionId: string,
  personId: string
): Promise<void> {
  const d = db(s.region);
  const owns = await d
    .select({ id: interactions.id })
    .from(interactions)
    .where(and(eq(interactions.id, interactionId), eq(interactions.workspaceId, s.workspaceId)))
    .get();
  if (!owns) throw new Error('not_found');
  await d
    .delete(interactionPeople)
    .where(
      and(eq(interactionPeople.interactionId, interactionId), eq(interactionPeople.personId, personId))
    );
}
