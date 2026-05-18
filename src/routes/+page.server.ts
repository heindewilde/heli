import { and, asc, desc, eq, gte, ne, or, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db, isMultiRegion } from '$lib/server/db';
import { people, companies, interactions as interactionsTable, projects } from '$lib/server/schema';
import { listInteractions } from '$lib/server/interactions-query';
import { isFirstUser } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
  if (!locals.user) {
    // Landing page is identical for every logged-out visitor — let an upstream
    // CDN serve it from the edge. Browsers always revalidate so a deploy is
    // picked up immediately; shared caches hold it for 5 min.
    setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=300' });
    return {
      user: null,
      authConfig: {
        registrationDisabled: process.env.DISABLE_REGISTRATION === '1' && !(await isFirstUser()),
        multiRegion: isMultiRegion()
      }
    };
  }
  const d = db(locals.user.region);
  const fourteenDaysAgo = Date.now() - 14 * 86_400_000;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const fourteenDaysAhead = Date.now() + 14 * 86_400_000;

  const [peopleCount, companiesCount, interactionsThisMonth, projectsActiveCount, recentInteractions, recentPeople, recentCompanies, endingSoon] = await Promise.all([
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
    d
      .select({ n: sql<number>`COUNT(*)` })
      .from(projects)
      .where(and(eq(projects.userId, locals.user.id), eq(projects.status, 'active')))
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
      .limit(5),
    // "Ending soon": active projects whose endDate is within the next 14
    // days OR already overdue. Overdue items appear first.
    d
      .select({
        id: projects.id,
        name: projects.name,
        endDate: projects.endDate,
        status: projects.status
      })
      .from(projects)
      .where(
        and(
          eq(projects.userId, locals.user.id),
          eq(projects.status, 'active'),
          or(
            and(gte(projects.endDate, 0), sql`${projects.endDate} < ${Date.now()}`),
            and(gte(projects.endDate, Date.now()), sql`${projects.endDate} <= ${fourteenDaysAhead}`)
          )
        )
      )
      .orderBy(asc(projects.endDate))
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
      interactionsThisMonth: Number(interactionsThisMonth?.n ?? 0),
      projects: Number(projectsActiveCount?.n ?? 0)
    },
    recent,
    recentInteractions,
    endingSoon
  };
};
