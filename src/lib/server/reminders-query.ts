import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { reminders, people, companies, interactions, type ReminderKind } from './schema';

export type ReminderRow = {
  id: string;
  kind: ReminderKind;
  refId: string;
  refLabel: string | null;
  refHref: string | null;
  remindAt: number;
  createdAt: number;
};

export async function listReminders(
  userId: string,
  region: string,
  opts: { limit?: number } = {}
): Promise<ReminderRow[]> {
  const d = db(region);
  const limit = Math.min(opts.limit ?? 100, 500);
  const rows = await d
    .select()
    .from(reminders)
    .where(eq(reminders.userId, userId))
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
      .where(and(eq(people.userId, userId), inArray(people.id, personIds)));
    for (const p of ps) labels.set(`person:${p.id}`, { label: p.name, href: `/people/${p.id}` });
  }
  const companyIds = groups.get('company') ?? [];
  if (companyIds.length) {
    const cs = await d
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(and(eq(companies.userId, userId), inArray(companies.id, companyIds)));
    for (const c of cs) labels.set(`company:${c.id}`, { label: c.name, href: `/companies/${c.id}` });
  }
  const interactionIds = groups.get('interaction') ?? [];
  if (interactionIds.length) {
    const is = await d
      .select({ id: interactions.id, title: interactions.title })
      .from(interactions)
      .where(and(eq(interactions.userId, userId), inArray(interactions.id, interactionIds)));
    for (const i of is) labels.set(`interaction:${i.id}`, { label: i.title, href: `/interactions/${i.id}` });
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
