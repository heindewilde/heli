import { and, asc, eq, inArray } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import {
  reminders,
  people,
  companies,
  interactions,
  projects,
  REMINDER_KINDS,
  type ReminderKind
} from './schema';
import type { Scope } from './scope';

export function isReminderKind(v: unknown): v is ReminderKind {
  return typeof v === 'string' && (REMINDER_KINDS as readonly string[]).includes(v);
}

/**
 * Does this record exist, in *this* workspace?
 *
 * Reminders are personal but their target is not, so the check is
 * workspace-scoped: you may set a reminder about any record your workspace can
 * see, and about none that it cannot.
 */
export async function refExists(s: Scope, kind: ReminderKind, refId: string): Promise<boolean> {
  const d = db(s.region);
  if (kind === 'person') {
    const r = await d
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.id, refId), eq(people.workspaceId, s.workspaceId)))
      .get();
    return !!r;
  }
  if (kind === 'company') {
    const r = await d
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, refId), eq(companies.workspaceId, s.workspaceId)))
      .get();
    return !!r;
  }
  if (kind === 'interaction') {
    const r = await d
      .select({ id: interactions.id })
      .from(interactions)
      .where(and(eq(interactions.id, refId), eq(interactions.workspaceId, s.workspaceId)))
      .get();
    return !!r;
  }
  const r = await d
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, refId), eq(projects.workspaceId, s.workspaceId)))
    .get();
  return !!r;
}

export type CreateReminderInput = {
  kind: ReminderKind;
  refId: string;
  remindAt: number;
};

/**
 * Create a personal reminder.
 *
 * Lifted out of `POST /api/reminders`, where it was inlined, so the outreach
 * follow-up nudge can reach it — same split as `tasks.ts` and its route.
 * `user_id` here is a real owner, not attribution: this is the one column that
 * makes the reminder yours rather than the workspace's.
 */
export async function createReminder(
  s: Scope,
  input: CreateReminderInput
): Promise<{ id: string; kind: ReminderKind; refId: string; remindAt: number }> {
  if (!Number.isFinite(input.remindAt)) throw new Error('invalid_remind_at');
  if (!(await refExists(s, input.kind, input.refId))) throw new Error('ref_not_found');

  const id = createId();
  await db(s.region).insert(reminders).values({
    id,
    workspaceId: s.workspaceId,
    userId: s.userId,
    kind: input.kind,
    refId: input.refId,
    remindAt: Math.floor(input.remindAt),
    createdAt: Date.now()
  });
  return { id, kind: input.kind, refId: input.refId, remindAt: Math.floor(input.remindAt) };
}

export type ReminderRow = {
  id: string;
  kind: ReminderKind;
  refId: string;
  refLabel: string | null;
  refHref: string | null;
  remindAt: number;
  createdAt: number;
};

/**
 * Reminders are PERSONAL — "remind me about this person" — so this filters on
 * both workspace and user. Scoping by workspace alone would drop every
 * colleague's reminders into your sidebar. The (workspace_id, user_id,
 * remind_at) index exists for exactly this query.
 *
 * The label lookups below are workspace-scoped, which is correct: you may hold
 * a reminder about any record in the workspace.
 */
export async function listReminders(
  s: Scope,
  opts: { limit?: number } = {}
): Promise<ReminderRow[]> {
  const d = db(s.region);
  const limit = Math.min(opts.limit ?? 100, 500);
  const rows = await d
    .select()
    .from(reminders)
    .where(and(eq(reminders.workspaceId, s.workspaceId), eq(reminders.userId, s.userId)))
    .orderBy(asc(reminders.remindAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const groups = new Map<ReminderKind, string[]>();
  for (const r of rows) {
    const k = r.kind as ReminderKind;
    const list = groups.get(k) ?? [];
    list.push(r.refId);
    groups.set(k, list);
  }

  const labels = new Map<string, { label: string; href: string }>();
  const personIds = groups.get('person') ?? [];
  if (personIds.length) {
    const ps = await d
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(and(eq(people.workspaceId, s.workspaceId), inArray(people.id, personIds)));
    for (const p of ps) labels.set(`person:${p.id}`, { label: p.name, href: `/people/${p.id}` });
  }
  const companyIds = groups.get('company') ?? [];
  if (companyIds.length) {
    const cs = await d
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(and(eq(companies.workspaceId, s.workspaceId), inArray(companies.id, companyIds)));
    for (const c of cs) labels.set(`company:${c.id}`, { label: c.name, href: `/companies/${c.id}` });
  }
  const interactionIds = groups.get('interaction') ?? [];
  if (interactionIds.length) {
    const is = await d
      .select({ id: interactions.id, title: interactions.title })
      .from(interactions)
      .where(
        and(eq(interactions.workspaceId, s.workspaceId), inArray(interactions.id, interactionIds))
      );
    for (const i of is) labels.set(`interaction:${i.id}`, { label: i.title, href: `/interactions/${i.id}` });
  }
  const projectIds = groups.get('project') ?? [];
  if (projectIds.length) {
    const ps = await d
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.workspaceId, s.workspaceId), inArray(projects.id, projectIds)));
    for (const p of ps) labels.set(`project:${p.id}`, { label: p.name, href: `/projects/${p.id}` });
  }

  return rows.map((r) => {
    const meta = labels.get(`${r.kind}:${r.refId}`);
    return {
      id: r.id,
      kind: r.kind as ReminderKind,
      refId: r.refId,
      refLabel: meta?.label ?? null,
      refHref: meta?.href ?? null,
      remindAt: r.remindAt,
      createdAt: r.createdAt
    };
  });
}
