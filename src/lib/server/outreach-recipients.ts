import { and, asc, eq } from 'drizzle-orm';
import { db } from './db';
import {
  people,
  companies,
  collections,
  collectionItems,
  pipelineItems,
  pipelineStages,
  pipelines
} from './schema';
import type { Scope } from './scope';

/** Everything the composer needs about one person, in one row. */
export type Recipient = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  location: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  companyName: string | null;
};

const COLS = {
  id: people.id,
  name: people.name,
  role: people.role,
  email: people.email,
  location: people.location,
  phone: people.phone,
  linkedinUrl: people.linkedinUrl,
  xUrl: people.xUrl,
  companyName: companies.name
};

/**
 * The people in a collection.
 *
 * Only `kind = 'person'` — a collection can hold companies too, and a template
 * addresses a person. Companies are skipped rather than reported: a mixed
 * collection is a normal thing to run outreach from.
 */
export async function collectionRecipients(
  s: Scope,
  collectionId: string
): Promise<{ name: string; people: Recipient[] } | null> {
  const collection = await db(s.region)
    .select({ name: collections.name })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.workspaceId, s.workspaceId)))
    .get();
  if (!collection) return null;

  const rows = await db(s.region)
    .select(COLS)
    .from(collectionItems)
    .innerJoin(people, eq(people.id, collectionItems.refId))
    .leftJoin(companies, eq(companies.id, people.companyId))
    .where(
      and(
        eq(collectionItems.collectionId, collectionId),
        eq(collectionItems.kind, 'person'),
        // The join table has no workspace_id; people does, and that is what
        // makes this query tenant-safe.
        eq(people.workspaceId, s.workspaceId),
        eq(people.isArchived, 0)
      )
    )
    .orderBy(asc(people.name));

  return { name: collection.name, people: rows };
}

/** The people sitting in one pipeline stage. */
export async function stageRecipients(
  s: Scope,
  stageId: string
): Promise<{ name: string; people: Recipient[] } | null> {
  const stage = await db(s.region)
    .select({ name: pipelineStages.name })
    .from(pipelineStages)
    .innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
    .where(and(eq(pipelineStages.id, stageId), eq(pipelines.workspaceId, s.workspaceId)))
    .get();
  if (!stage) return null;

  const rows = await db(s.region)
    .select(COLS)
    .from(pipelineItems)
    .innerJoin(people, eq(people.id, pipelineItems.refId))
    .leftJoin(companies, eq(companies.id, people.companyId))
    .where(
      and(
        eq(pipelineItems.stageId, stageId),
        eq(pipelineItems.kind, 'person'),
        eq(people.workspaceId, s.workspaceId),
        eq(people.isArchived, 0)
      )
    )
    .orderBy(asc(people.name));

  return { name: stage.name, people: rows };
}
