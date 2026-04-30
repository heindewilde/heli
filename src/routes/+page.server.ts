import { and, desc, eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { people, companies } from '$lib/server/schema';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) return { user: null };
  const d = db(locals.user.region);

  const [peopleCount, companiesCount, recentPeople, recentCompanies] = await Promise.all([
    d
      .select({ n: sql<number>`COUNT(*)` })
      .from(people)
      .where(and(eq(people.userId, locals.user.id), eq(people.isArchived, 0)))
      .get(),
    d
      .select({ n: sql<number>`COUNT(*)` })
      .from(companies)
      .where(and(eq(companies.userId, locals.user.id), eq(companies.isArchived, 0)))
      .get(),
    d
      .select({
        id: people.id,
        name: people.name,
        domain: people.domain,
        avatarUrl: people.avatarUrl,
        role: people.role,
        source: people.source,
        createdAt: people.createdAt
      })
      .from(people)
      .where(and(eq(people.userId, locals.user.id), eq(people.isArchived, 0)))
      .orderBy(desc(people.createdAt))
      .limit(5),
    d
      .select({
        id: companies.id,
        name: companies.name,
        domain: companies.domain,
        logoUrl: companies.logoUrl,
        faviconUrl: companies.faviconUrl,
        source: companies.source,
        createdAt: companies.createdAt
      })
      .from(companies)
      .where(and(eq(companies.userId, locals.user.id), eq(companies.isArchived, 0)))
      .orderBy(desc(companies.createdAt))
      .limit(5)
  ]);

  const recent = [
    ...recentPeople.map((p) => ({ kind: 'person' as const, ...p, sub: p.role || p.domain })),
    ...recentCompanies.map((c) => ({
      kind: 'company' as const,
      id: c.id,
      name: c.name,
      domain: c.domain,
      avatarUrl: c.logoUrl ?? c.faviconUrl,
      source: c.source,
      createdAt: c.createdAt,
      sub: c.domain
    }))
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8);

  return {
    user: locals.user,
    counts: {
      people: Number(peopleCount?.n ?? 0),
      companies: Number(companiesCount?.n ?? 0)
    },
    recent
  };
};
