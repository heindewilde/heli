import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { people, companies, interactions as interactionsTable } from '$lib/server/schema';
import { listInteractions } from '$lib/server/interactions-query';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) return { user: null };
  const d = db(locals.user.region);
  const fourteenDaysAgo = Date.now() - 14 * 86_400_000;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [peopleCount, companiesCount, interactionsThisMonth, recentInteractions, recentPeople, recentCompanies] = await Promise.all([
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
      .select({ n: sql<number>`COUNT(*)` })
      .from(interactionsTable)
      .where(and(eq(interactionsTable.userId, locals.user.id), gte(interactionsTable.occurredAt, monthStart.getTime())))
      .get(),
    listInteractions(locals.user.id, locals.user.region, { from: fourteenDaysAgo, limit: 10 }),
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
      companies: Number(companiesCount?.n ?? 0),
      interactionsThisMonth: Number(interactionsThisMonth?.n ?? 0)
    },
    recent,
    recentInteractions
  };
};
