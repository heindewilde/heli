import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';

export type DB = LibSQLDatabase<typeof schema>;

type Bundle = { client: Client; db: DB; isFile: boolean };

const cache = new Map<string, Bundle>();

const DEFAULT_REGION = 'local';
// PRIMARY_REGION only matters when remote replicas are configured. On a single-host
// self-host (no DATABASE_URL_* set) treat the local file as primary so labels and
// health output match reality.
const HAS_REMOTE_REPLICAS = ['EU', 'US', 'APAC'].some(
  (r) => process.env[`DATABASE_URL_${r}`]
);
const PRIMARY_REGION =
  process.env.PRIMARY_REGION ?? (HAS_REMOTE_REPLICAS ? 'EU' : DEFAULT_REGION);

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Memory-tunable for cheap servers. Defaults: 16 MB page cache, 64 MB mmap.
const SQLITE_CACHE_MB = envInt('SQLITE_CACHE_MB', 16);
const SQLITE_MMAP_MB = envInt('SQLITE_MMAP_MB', 64);

function regionUrl(region: string): { url: string; authToken?: string } {
  const upper = region.toUpperCase();
  const url =
    process.env[`DATABASE_URL_${upper}`] ||
    process.env.DATABASE_URL ||
    `file:${process.env.DB_PATH ?? './data/heli.db'}`;
  const authToken = process.env[`DATABASE_AUTH_TOKEN_${upper}`] || process.env.DATABASE_AUTH_TOKEN;
  return { url, authToken };
}

function buildBundle(url: string, authToken: string | undefined): Bundle {
  const isFile = url.startsWith('file:');
  if (isFile) {
    const path = url.slice('file:'.length);
    mkdirSync(dirname(path), { recursive: true });
  }
  const client = createClient({ url, ...(authToken ? { authToken } : {}) });
  const db = drizzle(client, { schema });
  return { client, db, isFile };
}

async function applyPragmas(client: Client) {
  await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('PRAGMA synchronous = NORMAL');
  await client.execute(`PRAGMA cache_size = -${SQLITE_CACHE_MB * 1024}`);
  await client.execute(`PRAGMA mmap_size = ${SQLITE_MMAP_MB * 1024 * 1024}`);
  await client.execute('PRAGMA temp_store = MEMORY');
  await client.execute('PRAGMA foreign_keys = ON');
}

function getBundle(region: string = DEFAULT_REGION): Bundle {
  const { url, authToken } = regionUrl(region);
  let b = cache.get(url);
  if (!b) {
    b = buildBundle(url, authToken);
    cache.set(url, b);
  }
  return b;
}

export async function initDb(): Promise<void> {
  const seen = new Set<string>();
  const regions = [DEFAULT_REGION, PRIMARY_REGION, 'EU', 'US', 'APAC'];
  for (const r of regions) {
    const { url } = regionUrl(r);
    if (seen.has(url)) continue;
    seen.add(url);
    const b = getBundle(r);
    if (b.isFile) await applyPragmas(b.client);
  }
}

export function client(region?: string): Client {
  return getBundle(region).client;
}

export function db(region?: string): DB {
  return getBundle(region).db;
}

export function primaryDb(): DB {
  return getBundle(PRIMARY_REGION).db;
}

export function primaryClient(): Client {
  return getBundle(PRIMARY_REGION).client;
}

export function defaultRegion(): string {
  return DEFAULT_REGION;
}

export function primaryRegion(): string {
  return PRIMARY_REGION;
}

export function allRegionUrls(): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of [DEFAULT_REGION, PRIMARY_REGION, 'EU', 'US', 'APAC']) {
    const { url } = regionUrl(r);
    if (!out.has(r)) out.set(r, url);
  }
  return out;
}
