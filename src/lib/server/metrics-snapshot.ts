import { client } from './db';
import {
  regionStats,
  activeUsers,
  contentTotals,
  pipelineOutcomes,
  taskStats,
  reminderStats,
  unusedResetTokens,
  type RegionKey
} from './admin-stats';

const TRACKED_METRICS = [
  'users_total',
  'people_total',
  'companies_total',
  'interactions_total',
  'tasks_open',
  'reminders_pending',
  'pipeline_items_open',
  'pipeline_items_won',
  'pipeline_items_lost',
  'sessions_active',
  'dau',
  'wau',
  'mau',
  'reset_tokens_unused'
] as const;

export type TrackedMetric = (typeof TRACKED_METRICS)[number];

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function hasSnapshotFor(c: ReturnType<typeof client>, date: string): Promise<boolean> {
  const r = await c.execute({
    sql: 'SELECT 1 FROM daily_metrics WHERE date = ? AND metric = ? LIMIT 1',
    args: [date, 'users_total']
  });
  return r.rows.length > 0;
}

async function writeSnapshot(
  c: ReturnType<typeof client>,
  date: string,
  values: Partial<Record<TrackedMetric, number>>
) {
  const entries = Object.entries(values).filter(([, v]) => typeof v === 'number');
  if (entries.length === 0) return;
  await c.batch(
    entries.map(([metric, value]) => ({
      sql: `INSERT OR REPLACE INTO daily_metrics (date, metric, value) VALUES (?, ?, ?)`,
      args: [date, metric, Number(value)]
    })),
    'write'
  );
}

export async function snapshotIfStale(region: RegionKey, label = region): Promise<void> {
  const c = client(region);
  const date = todayUtc();
  if (await hasSnapshotFor(c, date)) return;

  const [rs, au, totals, outcomes, tasks, reminders, resetTokens] = await Promise.all([
    regionStats(region, label),
    activeUsers(region),
    contentTotals(region),
    pipelineOutcomes(region),
    taskStats(region),
    reminderStats(region),
    unusedResetTokens(region)
  ]);

  const get = (table: string) => totals.find((t) => t.table === table)?.total ?? 0;
  const outcome = (kind: string) => outcomes.find((o) => o.stageKind === kind)?.count ?? 0;

  await writeSnapshot(c, date, {
    users_total: rs.users,
    sessions_active: rs.activeSessions,
    dau: au.dau,
    wau: au.wau,
    mau: au.mau,
    people_total: get('people'),
    companies_total: get('companies'),
    interactions_total: get('interactions'),
    tasks_open: tasks.open,
    reminders_pending: reminders.pending,
    pipeline_items_open: outcome('open'),
    pipeline_items_won: outcome('won'),
    pipeline_items_lost: outcome('lost'),
    reset_tokens_unused: resetTokens
  });
}

export interface TrendPoint {
  date: string;
  value: number;
}

export async function getTrend(
  region: RegionKey,
  metric: TrackedMetric,
  days: number
): Promise<TrendPoint[]> {
  const c = client(region);
  const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const r = await c.execute({
    sql: `SELECT date, value FROM daily_metrics
          WHERE metric = ? AND date >= ?
          ORDER BY date ASC`,
    args: [metric, since]
  });
  return r.rows.map((row) => ({ date: String(row.date), value: Number(row.value) }));
}

// Pad a trend series with zeros for missing days so charts have a fixed-length array.
export function padTrend(points: TrendPoint[], days: number): number[] {
  const out: number[] = new Array(days).fill(0);
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  const startMs = Date.now() - (days - 1) * 24 * 60 * 60 * 1000;
  for (let i = 0; i < days; i++) {
    const d = new Date(startMs + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    out[i] = byDate.get(d) ?? 0;
  }
  return out;
}
