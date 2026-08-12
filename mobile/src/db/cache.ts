import { db } from './index';
import type { SQLiteBindValue } from 'expo-sqlite';
import {
  UPSERT_COMPANY,
  UPSERT_INTERACTION,
  UPSERT_PERSON,
  companiesQuery,
  peopleQuery
} from './statements';

/**
 * Reading and writing the mirror.
 *
 * Every function takes a `workspaceId` and every statement filters on it. There
 * is no accessor that does not, which is the mobile analogue of `Scope` on the
 * server: the discipline is that screens never write SQL, so there is one place
 * to get tenancy right rather than one per screen.
 *
 * Rows are stored in the shape `/api/v1` returns them, not the server's schema.
 * The mirror exists to answer the questions the UI asks; anything else is a
 * translation layer nobody needs.
 */

export type PersonRow = {
  id: string;
  name: string;
  role: string | null;
  companyId: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  faviconUrl: string | null;
  url: string | null;
  priority: number | null;
  statusId: string | null;
  isFavorite: number;
  isArchived: number;
  createdAt: number;
  updatedAt: number;
  lastAt: number | null;
  pending?: number;
};

export type InteractionRow = {
  id: string;
  occurredAt: number;
  type: string;
  title: string;
  body: string | null;
  companyId: string | null;
  companyName: string | null;
  people: { id: string; name: string; avatarUrl: string | null }[];
  createdAt: number;
  updatedAt: number;
  pending?: number;
};

/* ── change notification ─────────────────────────────────────────────────── */

/**
 * One bus, keyed by table.
 *
 * `useSyncExternalStore` in the screens subscribes here, so a write anywhere —
 * a fetch landing, an optimistic patch, an outbox rollback — repaints whatever
 * is showing without the screens knowing about each other.
 */
type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribe(table: string, fn: Listener): () => void {
  const set = listeners.get(table) ?? new Set();
  set.add(fn);
  listeners.set(table, set);
  return () => set.delete(fn);
}

export function notify(table: string): void {
  for (const fn of listeners.get(table) ?? []) fn();
}

/* ── people ──────────────────────────────────────────────────────────────── */

export async function upsertPeople(workspaceId: string, rows: PersonRow[]): Promise<void> {
  if (rows.length === 0) return;
  const handle = await db();
  await handle.withTransactionAsync(async () => {
    for (const p of rows) {
      await handle.runAsync(
        UPSERT_PERSON,
        [
          p.id, workspaceId, p.name, p.role, p.companyId, p.companyName, p.email, p.phone,
          p.avatarUrl, p.faviconUrl, p.url, p.priority, p.statusId, p.isFavorite,
          p.isArchived, p.createdAt, p.updatedAt, p.lastAt
        ]
      );
    }
  });
  notify('people');
}

export async function listPeople(
  workspaceId: string,
  opts: { limit?: number; archived?: boolean; favorite?: boolean; q?: string } = {}
): Promise<PersonRow[]> {
  const handle = await db();
  const { sql, args } = peopleQuery(opts);
  const rows = await handle.getAllAsync<Record<string, unknown>>(
    sql,
    [workspaceId, ...args] as SQLiteBindValue[]
  );
  return rows.map(toPerson);
}

export async function getPerson(workspaceId: string, id: string): Promise<PersonRow | null> {
  const handle = await db();
  const row = await handle.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM people WHERE workspace_id = ? AND id = ?`,
    [workspaceId, id]
  );
  return row ? toPerson(row) : null;
}

/**
 * Apply a patch locally and hand back the previous values.
 *
 * The return value is what the outbox stores for rollback, and it is
 * deliberately only the columns that changed — restoring a whole row would
 * clobber fields a later, successful write had already updated.
 */
export async function patchPerson(
  workspaceId: string,
  id: string,
  patch: Partial<Record<'name' | 'role' | 'email' | 'phone' | 'priority' | 'status_id' | 'is_favorite' | 'is_archived', unknown>>
): Promise<Record<string, unknown> | null> {
  const handle = await db();
  const cols = Object.keys(patch);
  if (cols.length === 0) return null;

  const before = await handle.getFirstAsync<Record<string, unknown>>(
    `SELECT ${cols.join(', ')} FROM people WHERE workspace_id = ? AND id = ?`,
    [workspaceId, id]
  );
  if (!before) return null;

  await handle.runAsync(
    `UPDATE people SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ?
      WHERE workspace_id = ? AND id = ?`,
    [...cols.map((c) => patch[c as keyof typeof patch] as never), Date.now(), workspaceId, id]
  );
  notify('people');
  return before;
}

function toPerson(r: Record<string, unknown>): PersonRow {
  return {
    id: r.id as string,
    name: r.name as string,
    role: (r.role as string) ?? null,
    companyId: (r.company_id as string) ?? null,
    companyName: (r.company_name as string) ?? null,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    avatarUrl: (r.avatar_url as string) ?? null,
    faviconUrl: (r.favicon_url as string) ?? null,
    url: (r.url as string) ?? null,
    priority: (r.priority as number) ?? null,
    statusId: (r.status_id as string) ?? null,
    isFavorite: (r.is_favorite as number) ?? 0,
    isArchived: (r.is_archived as number) ?? 0,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    lastAt: (r.last_at as number) ?? null,
    pending: (r.pending as number) ?? 0
  };
}

/* ── interactions ────────────────────────────────────────────────────────── */

export async function upsertInteractions(
  workspaceId: string,
  rows: InteractionRow[]
): Promise<void> {
  if (rows.length === 0) return;
  const handle = await db();
  await handle.withTransactionAsync(async () => {
    for (const i of rows) {
      await handle.runAsync(
        UPSERT_INTERACTION,
        [
          i.id, workspaceId, i.occurredAt, i.type, i.title, i.body, i.companyId,
          i.companyName, JSON.stringify(i.people ?? []), i.createdAt, i.updatedAt
        ]
      );
    }
  });
  notify('interactions');
}

export async function listInteractions(
  workspaceId: string,
  opts: { personId?: string; limit?: number } = {}
): Promise<InteractionRow[]> {
  const handle = await db();
  const rows = await handle.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM interactions WHERE workspace_id = ?
      ORDER BY occurred_at DESC LIMIT ?`,
    [workspaceId, opts.limit ?? 50]
  );
  const all = rows.map(toInteraction);
  // Filtered in JS rather than SQL: the attendee list is denormalised JSON
  // because it is only ever rendered, and a person's timeline is at most a few
  // dozen rows out of the fifty held here.
  return opts.personId
    ? all.filter((i) => i.people.some((p) => p.id === opts.personId))
    : all;
}

/** Insert an interaction that exists only locally, pending an outbox send. */
export async function insertLocalInteraction(
  workspaceId: string,
  row: InteractionRow
): Promise<void> {
  const handle = await db();
  await handle.runAsync(
    `INSERT OR REPLACE INTO interactions
       (id, workspace_id, occurred_at, type, title, body, company_id,
        company_name, people_json, created_at, updated_at, pending)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
    [
      row.id, workspaceId, row.occurredAt, row.type, row.title, row.body, row.companyId,
      row.companyName, JSON.stringify(row.people ?? []), row.createdAt, row.updatedAt
    ]
  );
  notify('interactions');
}

function toInteraction(r: Record<string, unknown>): InteractionRow {
  return {
    id: r.id as string,
    occurredAt: r.occurred_at as number,
    type: r.type as string,
    title: r.title as string,
    body: (r.body as string) ?? null,
    companyId: (r.company_id as string) ?? null,
    companyName: (r.company_name as string) ?? null,
    people: JSON.parse((r.people_json as string) ?? '[]'),
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    pending: (r.pending as number) ?? 0
  };
}

/* ── companies ───────────────────────────────────────────────────────────── */

export type CompanyRow = {
  id: string;
  name: string;
  domain: string | null;
  url: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  industry: string | null;
  location: string | null;
  isFavorite: number;
  isArchived: number;
  createdAt: number;
  updatedAt: number;
  lastAt: number | null;
  pending?: number;
};

export async function upsertCompanies(workspaceId: string, rows: CompanyRow[]): Promise<void> {
  if (rows.length === 0) return;
  const handle = await db();
  await handle.withTransactionAsync(async () => {
    for (const c of rows) {
      await handle.runAsync(
        UPSERT_COMPANY,
        [
          c.id, workspaceId, c.name, c.domain, c.url, c.logoUrl, c.faviconUrl,
          c.industry, c.location, c.isFavorite, c.isArchived, c.createdAt,
          c.updatedAt, c.lastAt
        ]
      );
    }
  });
  notify('companies');
}

export async function listCompanies(
  workspaceId: string,
  opts: { limit?: number; q?: string } = {}
): Promise<CompanyRow[]> {
  const handle = await db();
  const { sql, args } = companiesQuery(opts);
  const rows = await handle.getAllAsync<Record<string, unknown>>(
    sql,
    [workspaceId, ...args] as SQLiteBindValue[]
  );
  return rows.map(toCompany);
}

export async function getCompany(workspaceId: string, id: string): Promise<CompanyRow | null> {
  const handle = await db();
  const row = await handle.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM companies WHERE workspace_id = ? AND id = ?`,
    [workspaceId, id]
  );
  return row ? toCompany(row) : null;
}

/** People at this company, from the mirror. */
export async function peopleAtCompany(
  workspaceId: string,
  companyId: string
): Promise<PersonRow[]> {
  const handle = await db();
  const rows = await handle.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM people
      WHERE workspace_id = ? AND company_id = ? AND is_archived = 0
      ORDER BY name COLLATE NOCASE`,
    [workspaceId, companyId]
  );
  return rows.map(toPerson);
}

function toCompany(r: Record<string, unknown>): CompanyRow {
  return {
    id: r.id as string,
    name: r.name as string,
    domain: (r.domain as string) ?? null,
    url: (r.url as string) ?? null,
    logoUrl: (r.logo_url as string) ?? null,
    faviconUrl: (r.favicon_url as string) ?? null,
    industry: (r.industry as string) ?? null,
    location: (r.location as string) ?? null,
    isFavorite: (r.is_favorite as number) ?? 0,
    isArchived: (r.is_archived as number) ?? 0,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    lastAt: (r.last_at as number) ?? null,
    pending: (r.pending as number) ?? 0
  };
}
