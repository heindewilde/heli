import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  regionStats,
  authBreakdown,
  unusedResetTokens,
  activeUsers,
  contentTotals,
  perUserDistribution,
  pipelineOutcomes,
  taskStats,
  reminderStats,
  topEmailDomains,
  recentSignups,
  opsInfo,
  dailyBuckets,
  regionsToScan,
  type RegionStats,
  type AuthBreakdown,
  type ContentTotals,
  type DistributionBand,
  type PipelineOutcomes,
  type RecentSignup,
  type OpsInfo
} from '$lib/server/admin-stats';
import { snapshotIfStale, getTrend, padTrend } from '$lib/server/metrics-snapshot';

const COOKIE = 'admin_session';
const COOKIE_TTL = 60 * 60 * 24 * 7;

function isAuthed(cookies: import('@sveltejs/kit').Cookies): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return cookies.get(COOKIE) === secret;
}

function sumNumber<T>(rows: T[], pick: (r: T) => number): number {
  return rows.reduce((s, r) => s + pick(r), 0);
}

function mergeBands(all: DistributionBand[][]): DistributionBand[] {
  if (all.length === 0) return [];
  return all[0].map((band, i) => ({
    label: band.label,
    count: all.reduce((s, b) => s + (b[i]?.count ?? 0), 0)
  }));
}

function mergeOutcomes(all: PipelineOutcomes[][]): PipelineOutcomes[] {
  const byKind = new Map<string, PipelineOutcomes>();
  for (const set of all) {
    for (const o of set) {
      let cur = byKind.get(o.stageKind);
      if (!cur) {
        cur = { stageKind: o.stageKind, count: 0, valueByCurrency: [] };
        byKind.set(o.stageKind, cur);
      }
      cur.count += o.count;
      for (const v of o.valueByCurrency) {
        const existing = cur.valueByCurrency.find((x) => x.currency === v.currency);
        if (existing) existing.cents += v.cents;
        else cur.valueByCurrency.push({ ...v });
      }
    }
  }
  const order = ['open', 'won', 'lost'];
  return [...byKind.values()].sort(
    (a, b) => order.indexOf(a.stageKind) - order.indexOf(b.stageKind)
  );
}

function mergeContentTotals(all: ContentTotals[][]): ContentTotals[] {
  const byTable = new Map<string, ContentTotals>();
  for (const set of all) {
    for (const c of set) {
      const cur = byTable.get(c.table);
      if (cur) {
        cur.total += c.total;
        cur.new7d += c.new7d;
      } else {
        byTable.set(c.table, { ...c });
      }
    }
  }
  return [...byTable.values()];
}

function mergeAuth(all: AuthBreakdown[]): AuthBreakdown {
  const providers = new Map<string, number>();
  let passwordOnly = 0;
  let oauthOnly = 0;
  for (const a of all) {
    passwordOnly += a.passwordOnly;
    oauthOnly += a.oauthOnly;
    for (const p of a.providers) providers.set(p.provider, (providers.get(p.provider) ?? 0) + p.count);
  }
  return {
    passwordOnly,
    oauthOnly,
    both: 0,
    providers: [...providers.entries()]
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count)
  };
}

function sumArrays(arrs: number[][]): number[] {
  if (arrs.length === 0) return [];
  const len = arrs[0].length;
  const out = new Array(len).fill(0) as number[];
  for (const arr of arrs) {
    for (let i = 0; i < len && i < arr.length; i++) out[i] += arr[i];
  }
  return out;
}

export const load: PageServerLoad = async ({ cookies }) => {
  if (!isAuthed(cookies)) return { authed: false as const };

  const secret = process.env.ADMIN_SECRET ?? '';
  const regions = regionsToScan();
  const multi = regions.length > 1;

  // Snapshot today's metrics for each region (idempotent — skips if today's row exists).
  await Promise.all(regions.map((r) => snapshotIfStale(r.region, r.label).catch(() => null)));

  const perRegion = await Promise.all(
    regions.map(async (r) => {
      const [
        rs,
        au,
        auth,
        resetTokens,
        content,
        peopleDist,
        companyDist,
        interactionDist,
        outcomes,
        tasks,
        reminders,
        topDomains,
        recents,
        signupBuckets,
        interactionBuckets,
        dauTrend,
        interactionsTrend
      ] = await Promise.all([
        regionStats(r.region, r.label),
        activeUsers(r.region),
        authBreakdown(r.region),
        unusedResetTokens(r.region),
        contentTotals(r.region),
        perUserDistribution(r.region, 'people'),
        perUserDistribution(r.region, 'companies'),
        perUserDistribution(r.region, 'interactions'),
        pipelineOutcomes(r.region),
        taskStats(r.region),
        reminderStats(r.region),
        topEmailDomains(r.region),
        recentSignups(r.region, secret),
        dailyBuckets(r.region, 'users', 'created_at', 30),
        dailyBuckets(r.region, 'interactions', 'occurred_at', 30),
        getTrend(r.region, 'dau', 30).then((t) => padTrend(t, 30)),
        getTrend(r.region, 'interactions_total', 30).then((t) => padTrend(t, 30))
      ]);
      return {
        region: r,
        rs,
        au,
        auth,
        resetTokens,
        content,
        peopleDist,
        companyDist,
        interactionDist,
        outcomes,
        tasks,
        reminders,
        topDomains,
        recents,
        signupBuckets,
        interactionBuckets,
        dauTrend,
        interactionsTrend
      };
    })
  );

  const ops = await opsInfo();

  const totals: RegionStats[] = perRegion.map((p) => p.rs);
  const totalUsers = sumNumber(totals, (t) => t.users);

  // 24h delta needs its own query — regionStats only has 7d/30d. Derive from buckets.
  const new24h = sumNumber(
    perRegion.map((p) => ({ n: p.signupBuckets[p.signupBuckets.length - 1] ?? 0 })),
    (x) => x.n
  );

  const combined = {
    totalUsers,
    new24h,
    new7d: sumNumber(totals, (t) => t.newUsers7d),
    new30d: sumNumber(totals, (t) => t.newUsers30d),
    activeSessions: sumNumber(totals, (t) => t.activeSessions),
    dau: sumNumber(
      perRegion.map((p) => ({ n: p.au.dau })),
      (x) => x.n
    ),
    wau: sumNumber(
      perRegion.map((p) => ({ n: p.au.wau })),
      (x) => x.n
    ),
    mau: sumNumber(
      perRegion.map((p) => ({ n: p.au.mau })),
      (x) => x.n
    ),
    auth: mergeAuth(perRegion.map((p) => p.auth)),
    resetTokens: sumNumber(
      perRegion.map((p) => ({ n: p.resetTokens })),
      (x) => x.n
    ),
    content: mergeContentTotals(perRegion.map((p) => p.content)),
    peopleDist: mergeBands(perRegion.map((p) => p.peopleDist)),
    companyDist: mergeBands(perRegion.map((p) => p.companyDist)),
    interactionDist: mergeBands(perRegion.map((p) => p.interactionDist)),
    outcomes: mergeOutcomes(perRegion.map((p) => p.outcomes)),
    tasks: {
      open: sumNumber(
        perRegion.map((p) => ({ n: p.tasks.open })),
        (x) => x.n
      ),
      completed: sumNumber(
        perRegion.map((p) => ({ n: p.tasks.completed })),
        (x) => x.n
      )
    },
    reminders: {
      pending: sumNumber(
        perRegion.map((p) => ({ n: p.reminders.pending })),
        (x) => x.n
      ),
      overdue: sumNumber(
        perRegion.map((p) => ({ n: p.reminders.overdue })),
        (x) => x.n
      )
    },
    signupBuckets: sumArrays(perRegion.map((p) => p.signupBuckets)),
    interactionBuckets: sumArrays(perRegion.map((p) => p.interactionBuckets)),
    dauTrend: sumArrays(perRegion.map((p) => p.dauTrend)),
    interactionsTrend: sumArrays(perRegion.map((p) => p.interactionsTrend))
  };

  // Top email domains: merge across regions, re-rank, top 10.
  const domainTotals = new Map<string, number>();
  for (const p of perRegion) {
    for (const d of p.topDomains) {
      domainTotals.set(d.domain, (domainTotals.get(d.domain) ?? 0) + d.count);
    }
  }
  const topDomains = [...domainTotals.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, 10);

  // Recent signups: merge per-region lists, sort desc by createdAt, top 10.
  const recents: RecentSignup[] = perRegion
    .flatMap((p) => p.recents)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10);

  // Stale-users heuristic (no session active OR all sessions expired). Approximate:
  // totalUsers - MAU.
  const staleUsers = Math.max(0, totalUsers - combined.mau);

  return {
    authed: true as const,
    multi,
    perRegion: perRegion.map((p) => p.rs),
    combined,
    topDomains,
    recents,
    ops,
    staleUsers
  };
};

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return fail(403, { error: 'Admin access not configured.' });

    const data = await request.formData();
    if (data.get('secret') !== secret) return fail(401, { error: 'Wrong secret.' });

    cookies.set(COOKIE, secret, {
      path: '/admin',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: COOKIE_TTL
    });
    redirect(303, '/admin');
  },

  logout: async ({ cookies }) => {
    cookies.delete(COOKIE, { path: '/admin' });
    redirect(303, '/admin');
  }
};

export type AdminLoadData = Awaited<ReturnType<typeof load>>;
export type { RegionStats, AuthBreakdown, ContentTotals, PipelineOutcomes, RecentSignup, OpsInfo };
