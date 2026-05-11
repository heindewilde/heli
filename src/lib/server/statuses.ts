import { createId } from '@paralleldrive/cuid2';
import { and, asc, eq, max } from 'drizzle-orm';
import { db } from './db';
import { peopleStatuses, companyStatuses } from './schema';
import { sanitizePlainText } from './sanitize';
import type { Kind } from './classify';

// Limited palette so the table reads coherently. The render side maps each
// tone to a semantic color token (info, success, warning, danger, neutral).
export const STATUS_TONES = ['gray', 'blue', 'green', 'amber', 'red'] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

export function isStatusTone(v: unknown): v is StatusTone {
  return typeof v === 'string' && (STATUS_TONES as readonly string[]).includes(v);
}

const TABLE = {
  person: peopleStatuses,
  company: companyStatuses
} as const;

export type StatusRow = {
  id: string;
  name: string;
  tone: StatusTone;
  sortOrder: number;
};

export async function listStatuses(
  scope: Kind,
  userId: string,
  region: string
): Promise<StatusRow[]> {
  const t = TABLE[scope];
  const d = db(region);
  const rows = await d
    .select({ id: t.id, name: t.name, tone: t.tone, sortOrder: t.sortOrder })
    .from(t)
    .where(eq(t.userId, userId))
    .orderBy(asc(t.sortOrder), asc(t.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    // Older rows may pre-date the enum; coerce defensively rather than
    // throwing on render.
    tone: isStatusTone(r.tone) ? r.tone : 'gray',
    sortOrder: r.sortOrder
  }));
}

export async function createStatus(
  scope: Kind,
  userId: string,
  region: string,
  input: { name: string; tone: string }
): Promise<StatusRow> {
  const name = sanitizePlainText(String(input.name ?? ''), 64);
  if (!name) throw new Error('missing_name');
  const tone: StatusTone = isStatusTone(input.tone) ? input.tone : 'gray';
  const t = TABLE[scope];
  const d = db(region);

  // Sort-order auto-appends; we don't reuse gaps. New statuses go to the end.
  const top = await d
    .select({ v: max(t.sortOrder) })
    .from(t)
    .where(eq(t.userId, userId))
    .get();
  const sortOrder = (top?.v ?? -1) + 1;

  const id = createId();
  try {
    await d.insert(t).values({ id, userId, name, tone, sortOrder, createdAt: Date.now() });
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (/uq_.*_user_name/i.test(msg) || /UNIQUE/i.test(msg)) {
      // Race: another concurrent create won the unique index. Return the
      // pre-existing row so the caller can move on.
      const existing = await d
        .select({ id: t.id, name: t.name, tone: t.tone, sortOrder: t.sortOrder })
        .from(t)
        .where(and(eq(t.userId, userId), eq(t.name, name)))
        .get();
      if (existing) {
        return {
          id: existing.id,
          name: existing.name,
          tone: isStatusTone(existing.tone) ? existing.tone : 'gray',
          sortOrder: existing.sortOrder
        };
      }
    }
    throw err;
  }
  return { id, name, tone, sortOrder };
}

export async function deleteStatus(
  scope: Kind,
  userId: string,
  region: string,
  id: string
): Promise<void> {
  const t = TABLE[scope];
  const d = db(region);
  await d.delete(t).where(and(eq(t.id, id), eq(t.userId, userId)));
}
