import { and, asc, desc, eq, gte, lte, ne, or, sql } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, isMultiRegion } from '$lib/server/db';
import { people, companies, interactions as interactionsTable, projects, reminders } from '$lib/server/schema';
import { listInteractions } from '$lib/server/interactions-query';
import { isRegistrationDisabled } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
  if (!locals.user) {
    // Self-host installs have no marketing landing — send straight to /auth.
    // Cloud (heli.so) sets SHOW_LANDING=1 to keep the landing page.
    if (process.env.SHOW_LANDING !== '1') {
      throw redirect(303, '/auth');
    }
    // Landing page is identical for every logged-out visitor — let an upstream
    // CDN serve it from the edge. Browsers always revalidate so a deploy is
    // picked up immediately; shared caches hold it for 5 min.
    setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=300' });
    return {
      user: null,
      authConfig: {
        registrationDisabled: await isRegistrationDisabled(),
        multiRegion: isMultiRegion()
      }
    };
  }
  const d = db(locals.user.region);
  const fourteenDaysAgo = Date.now() - 14 * 86_400_000;
  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const fourteenDaysAhead = Date.now() + 14 * 86_400_000;

  // End-of-today on the server's clock. Reminders due before this point are
  // "due today" — the timezone caveat is acceptable since reminders are
  // displayed in the same server-relative bucketing elsewhere.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTodayMs = endOfToday.getTime();

  const [peopleCount, companiesCount, interactionsThisMonth, projectsActiveCount, recentInteractions, recentPeople, recentCompanies, endingSoon, dueTodayCount, savesThisWeekCount] = await Promise.all([
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
      .limit(5),
    d
      .select({ n: sql<number>`COUNT(*)` })
      .from(reminders)
      .where(and(eq(reminders.userId, locals.user.id), lte(reminders.remindAt, endOfTodayMs)))
      .get(),
    d
      .select({
        n: sql<number>`
          (SELECT COUNT(*) FROM ${people} WHERE ${people.userId} = ${locals.user.id} AND ${people.isArchived} = 0 AND ${people.createdAt} >= ${sevenDaysAgo})
          +
          (SELECT COUNT(*) FROM ${companies} WHERE ${companies.userId} = ${locals.user.id} AND ${companies.isArchived} = 0 AND ${companies.createdAt} >= ${sevenDaysAgo})
        `
      })
      .from(sql`(SELECT 1)`)
      .get()
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

  const serverHour = new Date().getHours();
  const greeting =
    serverHour < 5 ? 'Good evening' : serverHour < 12 ? 'Good morning' : serverHour < 18 ? 'Good afternoon' : 'Good evening';

  return {
    user: locals.user,
    greeting,
    counts: {
      people: Number(peopleCount?.n ?? 0),
      companies: Number(companiesCount?.n ?? 0),
      interactionsThisMonth: Number(interactionsThisMonth?.n ?? 0),
      projects: Number(projectsActiveCount?.n ?? 0)
    },
    recent,
    recentInteractions,
    endingSoon,
    summary: {
      dueToday: Number(dueTodayCount?.n ?? 0),
      savesThisWeek: Number(savesThisWeekCount?.n ?? 0)
    }
  };
};
