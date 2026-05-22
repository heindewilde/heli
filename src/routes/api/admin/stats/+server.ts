import { error, json } from '@sveltejs/kit';
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
  regionsToScan
} from '$lib/server/admin-stats';
import { snapshotIfStale, getTrend, padTrend } from '$lib/server/metrics-snapshot';

export const GET = async ({ request }) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw error(403, 'ADMIN_SECRET not configured');

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) throw error(401, 'unauthorized');

  const regions = regionsToScan();
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
        region: r.region,
        label: r.label,
        users: rs,
        activeUsers: au,
        auth,
        unusedResetTokens: resetTokens,
        content,
        peopleDist,
        pipelineOutcomes: outcomes,
        tasks,
        reminders,
        topEmailDomains: topDomains,
        recentSignups: recents,
        signupBuckets,
        interactionBuckets,
        dauTrend,
        interactionsTrend
      };
    })
  );

  const ops = await opsInfo();
  return json({
    multiRegion: regions.length > 1,
    perRegion,
    ops
  });
};
