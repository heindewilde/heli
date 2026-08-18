import { and, desc, eq } from 'drizzle-orm';
import { db } from './db';
import { people, companies } from './schema';
import type { Scope } from './scope';
import type { CompanyRecipient, Recipient } from '$lib/outreach/render';

/**
 * A real person to preview a template against.
 *
 * A made-up "Jane Doe" would always look complete. A record you actually hold
 * shows immediately whether your data carries the fields the template asks
 * for — which is the thing worth learning while writing it.
 */
export async function sampleRecipient(s: Scope): Promise<Recipient | null> {
  const row = await db(s.region)
    .select({
      name: people.name,
      role: people.role,
      email: people.email,
      location: people.location,
      companyName: companies.name
    })
    .from(people)
    .leftJoin(companies, eq(companies.id, people.companyId))
    .where(and(eq(people.workspaceId, s.workspaceId), eq(people.isArchived, 0)))
    .orderBy(desc(people.updatedAt))
    .limit(1)
    .get();
  return row ?? null;
}

/**
 * The company arm. Loaded alongside `sampleRecipient` wherever the editor
 * runs, because the target is editable and switching it must not need a round
 * trip.
 */
export async function sampleCompanyRecipient(s: Scope): Promise<CompanyRecipient | null> {
  const row = await db(s.region)
    .select({
      name: companies.name,
      email: companies.email,
      location: companies.location,
      domain: companies.domain,
      industry: companies.industry,
      sizeBand: companies.sizeBand
    })
    .from(companies)
    .where(and(eq(companies.workspaceId, s.workspaceId), eq(companies.isArchived, 0)))
    .orderBy(desc(companies.updatedAt))
    .limit(1)
    .get();
  return row ? { ...row, kind: 'company' } : null;
}
