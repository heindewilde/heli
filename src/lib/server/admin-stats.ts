import { createHash } from 'node:crypto';
import { stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { db, client, REGIONS, REGION_LABELS, isMultiRegion, primaryRegion } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * DAY_MS;

export type RegionKey = string;

export interface RegionStats {
  region: RegionKey;
  label: string;
  users: number;
  newUsers7d: number;
  newUsers30d: number;
  activeSessions: number;
  dbSizeBytes: number | null;
}

export interface AuthBreakdown {
  passwordOnly: number;
  oauthOnly: number;
  both: number;
  providers: { provider: string; count: number }[];
}

export interface ContentTotals {
  table: string;
  total: number;
  new7d: number;
}

export interface DistributionBand {
  label: string;
  count: number;
}

export interface PipelineOutcomes {
  stageKind: string;
  count: number;
  valueByCurrency: { currency: string; cents: number }[];
}

export interface RecentSignup {
  maskedEmail: string;
  domain: string;
  region: string;
  authMethod: 'password' | 'oauth';
  createdAt: number;
}

export interface OpsInfo {
  version: string;
  uptimeSec: number;
  rssBytes: number;
  heapUsedBytes: number;
  selfHost: boolean;
  primaryRegion: string;
  pragmas: { name: string; value: string }[];
  staleParsingPeople: number;
  staleParsingCompanies: number;
  avatarCacheBytes: number | null;
  avatarCacheFiles: number | null;
}

const dayBoundary = (n: number) => Date.now() - n * DAY_MS;

async function countWhere(c: Client, table: string, where = '', args: unknown[] = []): Promise<number> {
  const sql = `SELECT COUNT(*) AS n FROM ${table}${where ? ` WHERE ${where}` : ''}`;
  const r = await c.execute({ sql, args: args as never });
  return Number(r.rows[0]?.n ?? 0);
}

export async function regionStats(region: RegionKey, label: string): Promise<RegionStats> {
  const c = client(region);
  const now = Date.now();
  const [users, new7d, new30d, activeSessions, sizeBytes] = await Promise.all([
    countWhere(c, 'users'),
    countWhere(c, 'users', 'created_at >= ?', [dayBoundary(7)]),
    countWhere(c, 'users', 'created_at >= ?', [dayBoundary(30)]),
    distinctActiveSessionUsers(c, now),
    dbSizeBytes(c)
  ]);
  return { region, label, users, newUsers7d: new7d, newUsers30d: new30d, activeSessions, dbSizeBytes: sizeBytes };
}

async function distinctActiveSessionUsers(c: Client, now: number): Promise<number> {
  const r = await c.execute({
    sql: 'SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE expires_at > ?',
    args: [now]
  });
  return Number(r.rows[0]?.n ?? 0);
}

// Sessions don't store created_at; expires_at = login_time + 30d.
// So "logged in within last D days" ≈ "expires_at > now + (30 - D) days".
async function distinctActiveUsersWithin(c: Client, days: number): Promise<number> {
  const threshold = Date.now() + (30 - days) * DAY_MS;
  const r = await c.execute({
    sql: 'SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE expires_at > ?',
    args: [threshold]
  });
  return Number(r.rows[0]?.n ?? 0);
}

export async function activeUsers(region: RegionKey): Promise<{ dau: number; wau: number; mau: number }> {
  const c = client(region);
  const [dau, wau, mau] = await Promise.all([
    distinctActiveUsersWithin(c, 1),
    distinctActiveUsersWithin(c, 7),
    distinctActiveUsersWithin(c, 30)
  ]);
  return { dau, wau, mau };
}

export async function dailyBuckets(
  region: RegionKey,
  table: string,
  column: string,
  days = 30
): Promise<number[]> {
  const c = client(region);
  const since = Date.now() - days * DAY_MS;
  const r = await c.execute({
    sql: `SELECT ${column} AS t FROM ${table} WHERE ${column} >= ? ORDER BY ${column} ASC`,
    args: [since]
  });
  const buckets = new Array(days).fill(0) as number[];
  const startOfTodayUtc = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  for (const row of r.rows) {
    const t = Number(row.t);
    const dayIndex = Math.floor((t - (startOfTodayUtc - (days - 1) * DAY_MS)) / DAY_MS);
    if (dayIndex >= 0 && dayIndex < days) buckets[dayIndex] += 1;
  }
  return buckets;
}

export async function authBreakdown(region: RegionKey): Promise<AuthBreakdown> {
  const c = client(region);
  // Count distinct users present in oauth_accounts.
  const [usersTotalRow, oauthUsersRow, providerRows] = await Promise.all([
    c.execute('SELECT COUNT(*) AS n FROM users'),
    c.execute('SELECT COUNT(DISTINCT user_id) AS n FROM oauth_accounts'),
    c.execute(
      'SELECT provider, COUNT(*) AS n FROM oauth_accounts GROUP BY provider ORDER BY n DESC'
    )
  ]);
  const usersTotal = Number(usersTotalRow.rows[0]?.n ?? 0);
  const oauthUsers = Number(oauthUsersRow.rows[0]?.n ?? 0);
  // Every user has a passwordHash row (NOT NULL). We don't know which set their own
  // password vs which only use OAuth; treat OAuth presence as the discriminator.
  return {
    passwordOnly: Math.max(0, usersTotal - oauthUsers),
    oauthOnly: oauthUsers,
    both: 0,
    providers: providerRows.rows.map((r) => ({
      provider: String(r.provider),
      count: Number(r.n)
    }))
  };
}

export async function unusedResetTokens(region: RegionKey): Promise<number> {
  const c = client(region);
  return countWhere(c, 'password_reset_tokens', 'used_at IS NULL AND expires_at > ?', [Date.now()]);
}

const CONTENT_TABLES = [
  'people',
  'companies',
  'interactions',
  'tasks',
  'reminders',
  'projects',
  'pipelines',
  'pipeline_items',
  'collections',
  'tags',
  'oauth_accounts'
] as const;

export async function contentTotals(region: RegionKey): Promise<ContentTotals[]> {
  const c = client(region);
  const since = dayBoundary(7);
  const results: ContentTotals[] = [];
  await Promise.all(
    CONTENT_TABLES.map(async (table) => {
      const [total, new7d] = await Promise.all([
        countWhere(c, table),
        countWhere(c, table, 'created_at >= ?', [since])
      ]);
      results.push({ table, total, new7d });
    })
  );
  // Keep stable order matching CONTENT_TABLES.
  results.sort(
    (a, b) =>
      CONTENT_TABLES.indexOf(a.table as (typeof CONTENT_TABLES)[number]) -
      CONTENT_TABLES.indexOf(b.table as (typeof CONTENT_TABLES)[number])
  );
  return results;
}

const BANDS = [
  { label: '0', max: 0 },
  { label: '1–10', max: 10 },
  { label: '11–100', max: 100 },
  { label: '101–1k', max: 1000 },
  { label: '>1k', max: Infinity }
];

export async function perUserDistribution(region: RegionKey, table: string): Promise<DistributionBand[]> {
  const c = client(region);
  // users with zero rows: total users minus users with at least one row
  const [totalUsersRow, perUserRows] = await Promise.all([
    c.execute('SELECT COUNT(*) AS n FROM users'),
    c.execute(`SELECT user_id, COUNT(*) AS n FROM ${table} GROUP BY user_id`)
  ]);
  const totalUsers = Number(totalUsersRow.rows[0]?.n ?? 0);
  const bands = BANDS.map((b) => ({ label: b.label, count: 0 }));
  let usersWithAny = 0;
  for (const row of perUserRows.rows) {
    const n = Number(row.n ?? 0);
    if (n <= 0) continue;
    usersWithAny += 1;
    const idx = BANDS.findIndex((b) => n <= b.max);
    if (idx >= 0) bands[idx].count += 1;
  }
  bands[0].count = Math.max(0, totalUsers - usersWithAny);
  return bands;
}

export async function pipelineOutcomes(region: RegionKey): Promise<PipelineOutcomes[]> {
  const c = client(region);
  const r = await c.execute(`
    SELECT s.kind AS stage_kind,
           COUNT(*) AS n,
           pi.currency AS currency,
           COALESCE(SUM(pi.value_cents), 0) AS sum_cents
    FROM pipeline_items pi
    JOIN pipeline_stages s ON s.id = pi.stage_id
    GROUP BY s.kind, pi.currency
  `);
  const byKind = new Map<string, PipelineOutcomes>();
  for (const row of r.rows) {
    const kind = String(row.stage_kind);
    const cur = String(row.currency ?? '');
    const count = Number(row.n);
    const cents = Number(row.sum_cents);
    let entry = byKind.get(kind);
    if (!entry) {
      entry = { stageKind: kind, count: 0, valueByCurrency: [] };
      byKind.set(kind, entry);
    }
    entry.count += count;
    if (cur && cents > 0) {
      const existing = entry.valueByCurrency.find((v) => v.currency === cur);
      if (existing) existing.cents += cents;
      else entry.valueByCurrency.push({ currency: cur, cents });
    }
  }
  // Stable order: open, won, lost.
  const order = ['open', 'won', 'lost'];
  return [...byKind.values()].sort(
    (a, b) => order.indexOf(a.stageKind) - order.indexOf(b.stageKind)
  );
}

export async function taskStats(region: RegionKey): Promise<{ open: number; completed: number }> {
  const c = client(region);
  const [open, completed] = await Promise.all([
    countWhere(c, 'tasks', 'completed_at IS NULL'),
    countWhere(c, 'tasks', 'completed_at IS NOT NULL')
  ]);
  return { open, completed };
}

export async function reminderStats(region: RegionKey): Promise<{ pending: number; overdue: number }> {
  const c = client(region);
  const now = Date.now();
  const [pending, overdue] = await Promise.all([
    countWhere(c, 'reminders', 'remind_at > ?', [now]),
    countWhere(c, 'reminders', 'remind_at <= ?', [now])
  ]);
  return { pending, overdue };
}

export async function topEmailDomains(
  region: RegionKey,
  limit = 10
): Promise<{ domain: string; count: number }[]> {
  const c = client(region);
  // Extract everything after the last '@'. SQLite has no SPLIT_PART; instr+substr does the job.
  const r = await c.execute({
    sql: `
      SELECT LOWER(SUBSTR(email, INSTR(email, '@') + 1)) AS domain,
             COUNT(*) AS n
      FROM users
      WHERE INSTR(email, '@') > 0
      GROUP BY domain
      ORDER BY n DESC, domain ASC
      LIMIT ?
    `,
    args: [limit]
  });
  return r.rows.map((row) => ({ domain: String(row.domain), count: Number(row.n) }));
}

function maskEmailSalted(email: string, salt: string): string {
  const at = email.indexOf('@');
  if (at < 0) return '••••';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const hash = createHash('sha256').update(salt + ':' + local.toLowerCase()).digest('hex').slice(0, 4);
  return `${hash}••••@${domain}`;
}

export async function recentSignups(region: RegionKey, salt: string, limit = 10): Promise<RecentSignup[]> {
  const c = client(region);
  const r = await c.execute({
    sql: `
      SELECT u.email, u.created_at,
             EXISTS(SELECT 1 FROM oauth_accounts oa WHERE oa.user_id = u.id) AS has_oauth
      FROM users u
      ORDER BY u.created_at DESC
      LIMIT ?
    `,
    args: [limit]
  });
  const label = REGION_LABELS[region as keyof typeof REGION_LABELS] ?? region;
  return r.rows.map((row) => {
    const email = String(row.email);
    const at = email.indexOf('@');
    return {
      maskedEmail: maskEmailSalted(email, salt),
      domain: at >= 0 ? email.slice(at + 1).toLowerCase() : '',
      region: label,
      authMethod: Number(row.has_oauth) > 0 ? ('oauth' as const) : ('password' as const),
      createdAt: Number(row.created_at)
    };
  });
}

async function dbSizeBytes(c: Client): Promise<number | null> {
  try {
    const [pages, size] = await Promise.all([
      c.execute('PRAGMA page_count'),
      c.execute('PRAGMA page_size')
    ]);
    const pc = Number(pages.rows[0]?.page_count ?? pages.rows[0]?.[Object.keys(pages.rows[0])[0]] ?? 0);
    const ps = Number(size.rows[0]?.page_size ?? size.rows[0]?.[Object.keys(size.rows[0])[0]] ?? 0);
    if (!pc || !ps) return null;
    return pc * ps;
  } catch {
    return null;
  }
}

async function readPragma(c: Client, name: string): Promise<string> {
  try {
    const r = await c.execute(`PRAGMA ${name}`);
    const row = r.rows[0];
    if (!row) return '';
    const k = Object.keys(row)[0];
    return String(row[k]);
  } catch {
    return '';
  }
}

async function avatarCacheStats(): Promise<{ bytes: number; files: number } | null> {
  const dir = process.env.AVATARS_DIR ?? './data/avatars';
  try {
    const entries = await readdir(dir);
    let bytes = 0;
    let files = 0;
    await Promise.all(
      entries.map(async (name) => {
        try {
          const s = await stat(join(dir, name));
          if (s.isFile()) {
            bytes += s.size;
            files += 1;
          }
        } catch {
          /* skip */
        }
      })
    );
    return { bytes, files };
  } catch {
    return null;
  }
}

let avatarCacheCache: { at: number; value: { bytes: number; files: number } | null } | null = null;
async function avatarCacheStatsCached(): Promise<{ bytes: number; files: number } | null> {
  const now = Date.now();
  if (avatarCacheCache && now - avatarCacheCache.at < 60_000) return avatarCacheCache.value;
  const value = await avatarCacheStats();
  avatarCacheCache = { at: now, value };
  return value;
}

export async function opsInfo(): Promise<OpsInfo> {
  const { VERSION } = await import('$lib/version');
  const region = primaryRegion();
  const c = client(region);
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  const [pragmaValues, stalePeople, staleCos, avatars] = await Promise.all([
    Promise.all([
      readPragma(c, 'journal_mode'),
      readPragma(c, 'cache_size'),
      readPragma(c, 'mmap_size'),
      readPragma(c, 'synchronous'),
      readPragma(c, 'wal_autocheckpoint')
    ]),
    countWhere(c, 'people', "source = 'parsing' AND updated_at < ?", [tenMinAgo]),
    countWhere(c, 'companies', "source = 'parsing' AND updated_at < ?", [tenMinAgo]),
    avatarCacheStatsCached()
  ]);
  const mem = process.memoryUsage();
  return {
    version: VERSION,
    uptimeSec: Math.round(process.uptime()),
    rssBytes: mem.rss,
    heapUsedBytes: mem.heapUsed,
    selfHost: !isMultiRegion() && !process.env.FLY_REGION,
    primaryRegion: region,
    pragmas: [
      { name: 'journal_mode', value: pragmaValues[0] },
      { name: 'cache_size', value: pragmaValues[1] },
      { name: 'mmap_size', value: pragmaValues[2] },
      { name: 'synchronous', value: pragmaValues[3] },
      { name: 'wal_autocheckpoint', value: pragmaValues[4] }
    ],
    staleParsingPeople: stalePeople,
    staleParsingCompanies: staleCos,
    avatarCacheBytes: avatars?.bytes ?? null,
    avatarCacheFiles: avatars?.files ?? null
  };
}

export function regionsToScan(): { region: RegionKey; label: string }[] {
  if (isMultiRegion()) {
    return REGIONS.map((r) => ({ region: r, label: REGION_LABELS[r] }));
  }
  const r = primaryRegion();
  return [{ region: r, label: 'Local' }];
}

// Drizzle db handle is unused in this module but re-exported so callers can compose richer reads if they want.
export { db };
