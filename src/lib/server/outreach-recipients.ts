import { and, asc, eq, inArray } from 'drizzle-orm';
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
import type { OutreachTarget } from '$lib/outreach/platforms';

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

/**
 * The company equivalent.
 *
 * `kind` is stamped here, server-side, rather than left for the client to set:
 * `buildVariables` narrows on it, and a row that arrives without it renders as
 * a person with an empty name. Making the query responsible for it means no
 * call site can forget.
 */
export type CompanyRecipient = {
  kind: 'company';
  id: string;
  name: string;
  email: string | null;
  location: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  domain: string | null;
  industry: string | null;
  sizeBand: string | null;
};

/** Either kind, as the run screen and the composer see it. */
export type AudienceMember = Recipient | CompanyRecipient;

/**
 * The most recipients one run may carry.
 *
 * The run screen renders every message up front — that is what keeps Copy
 * synchronous inside the click gesture — so the audience is bounded by what is
 * reasonable to render at once, and it matches `MAX_BULK_IDS` so a full
 * selection always fits.
 */
export const MAX_AUDIENCE = 200;

const COMPANY_COLS = {
  id: companies.id,
  name: companies.name,
  email: companies.email,
  location: companies.location,
  phone: companies.phone,
  linkedinUrl: companies.linkedinUrl,
  xUrl: companies.xUrl,
  domain: companies.domain,
  industry: companies.industry,
  sizeBand: companies.sizeBand
};

/** Stamp the discriminant the renderer narrows on. */
function asCompanies(rows: Omit<CompanyRecipient, 'kind'>[]): CompanyRecipient[] {
  return rows.map((r) => ({ ...r, kind: 'company' as const }));
}

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

/* ── Company audiences ──────────────────────────────────────────────────────
 *
 * Four near-identical queries rather than one parameterised switch, matching
 * the two above. The projections and the join targets differ entirely, and the
 * value of this file is that each query reads at a glance — a sixty-line
 * function branching on kind would hide the one thing worth checking, which is
 * that every one of them filters on `workspace_id`.
 */

/** The companies in a collection. */
export async function collectionCompanyRecipients(
  s: Scope,
  collectionId: string
): Promise<{ name: string; members: CompanyRecipient[] } | null> {
  const collection = await db(s.region)
    .select({ name: collections.name })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.workspaceId, s.workspaceId)))
    .get();
  if (!collection) return null;

  const rows = await db(s.region)
    .select(COMPANY_COLS)
    .from(collectionItems)
    .innerJoin(companies, eq(companies.id, collectionItems.refId))
    .where(
      and(
        eq(collectionItems.collectionId, collectionId),
        eq(collectionItems.kind, 'company'),
        // Again: the join table has no workspace_id, companies does.
        eq(companies.workspaceId, s.workspaceId),
        eq(companies.isArchived, 0)
      )
    )
    .orderBy(asc(companies.name));

  return { name: collection.name, members: asCompanies(rows) };
}

/** The companies sitting in one pipeline stage. */
export async function stageCompanyRecipients(
  s: Scope,
  stageId: string
): Promise<{ name: string; members: CompanyRecipient[] } | null> {
  const stage = await db(s.region)
    .select({ name: pipelineStages.name })
    .from(pipelineStages)
    .innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
    .where(and(eq(pipelineStages.id, stageId), eq(pipelines.workspaceId, s.workspaceId)))
    .get();
  if (!stage) return null;

  const rows = await db(s.region)
    .select(COMPANY_COLS)
    .from(pipelineItems)
    .innerJoin(companies, eq(companies.id, pipelineItems.refId))
    .where(
      and(
        eq(pipelineItems.stageId, stageId),
        eq(pipelineItems.kind, 'company'),
        eq(companies.workspaceId, s.workspaceId),
        eq(companies.isArchived, 0)
      )
    )
    .orderBy(asc(companies.name));

  return { name: stage.name, members: asCompanies(rows) };
}

/**
 * An explicit list of ids — what a multi-select on `/people` sends.
 *
 * Ids from another workspace resolve to nothing rather than raising, the same
 * contract the bulk endpoints use: a selection can go stale between the tick
 * and the click, and a smaller audience is a better outcome than a 404.
 *
 * Archived rows are *not* excluded here, unlike the collection and stage
 * queries. You cannot tick a row you cannot see, so if an archived person is in
 * the list it is because the user filtered for archived and selected them on
 * purpose.
 */
export async function idsRecipients(
  s: Scope,
  ids: string[]
): Promise<{ name: string; members: Recipient[] }> {
  const wanted = ids.slice(0, MAX_AUDIENCE);
  if (wanted.length === 0) return { name: 'Selection', members: [] };
  const rows = await db(s.region)
    .select(COLS)
    .from(people)
    .leftJoin(companies, eq(companies.id, people.companyId))
    .where(and(eq(people.workspaceId, s.workspaceId), inArray(people.id, wanted)))
    .orderBy(asc(people.name));
  return { name: `${rows.length} selected`, members: rows };
}

export async function idsCompanyRecipients(
  s: Scope,
  ids: string[]
): Promise<{ name: string; members: CompanyRecipient[] }> {
  const wanted = ids.slice(0, MAX_AUDIENCE);
  if (wanted.length === 0) return { name: 'Selection', members: [] };
  const rows = await db(s.region)
    .select(COMPANY_COLS)
    .from(companies)
    .where(and(eq(companies.workspaceId, s.workspaceId), inArray(companies.id, wanted)))
    .orderBy(asc(companies.name));
  return { name: `${rows.length} selected`, members: asCompanies(rows) };
}

/**
 * The single entry point the run screen uses, so it branches once rather than
 * six times. `target` comes off the template — the audience a template can be
 * run against is decided by who it addresses, not by what the URL asks for.
 */
export async function resolveAudience(
  s: Scope,
  target: OutreachTarget,
  src: { collectionId?: string | null; stageId?: string | null; ids?: string[] | null }
): Promise<{ name: string; members: AudienceMember[] } | null> {
  const company = target === 'company';

  if (src.ids && src.ids.length > 0) {
    return company ? idsCompanyRecipients(s, src.ids) : idsRecipients(s, src.ids);
  }
  if (src.collectionId) {
    if (company) return collectionCompanyRecipients(s, src.collectionId);
    const found = await collectionRecipients(s, src.collectionId);
    return found && { name: found.name, members: found.people };
  }
  if (src.stageId) {
    if (company) return stageCompanyRecipients(s, src.stageId);
    const found = await stageRecipients(s, src.stageId);
    return found && { name: found.name, members: found.people };
  }
  return null;
}
