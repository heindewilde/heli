import { createId } from '@paralleldrive/cuid2';
import { and, asc, eq, max } from 'drizzle-orm';
import { db } from './db';
import { peopleStatuses, companyStatuses } from './schema';
import { sanitizePlainText } from './sanitize';
import type { Scope } from './scope';
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

export async function listStatuses(kind: Kind, s: Scope): Promise<StatusRow[]> {
  const t = TABLE[kind];
  const d = db(s.region);
  const rows = await d
    .select({ id: t.id, name: t.name, tone: t.tone, sortOrder: t.sortOrder })
    .from(t)
    .where(eq(t.workspaceId, s.workspaceId))
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
  kind: Kind,
  s: Scope,
  input: { name: string; tone: string }
): Promise<StatusRow> {
  const name = sanitizePlainText(String(input.name ?? ''), 64);
  if (!name) throw new Error('missing_name');
  const tone: StatusTone = isStatusTone(input.tone) ? input.tone : 'gray';
  const t = TABLE[kind];
  const d = db(s.region);

  // Sort-order auto-appends; we don't reuse gaps. New statuses go to the end.
  const top = await d
    .select({ v: max(t.sortOrder) })
    .from(t)
    .where(eq(t.workspaceId, s.workspaceId))
    .get();
  const sortOrder = (top?.v ?? -1) + 1;

  const id = createId();
  try {
    await d
      .insert(t)
      .values({
        id,
        workspaceId: s.workspaceId,
        userId: s.userId,
        name,
        tone,
        sortOrder,
        createdAt: Date.now()
      });
  } catch (err) {
    const msg = (err as Error).message ?? '';
    // Index was renamed uq_*_user_name → uq_*_ws_name with workspaces; match both
    // so the friendly "name already used" path doesn't silently fall through to
    // the generic UNIQUE branch.
    if (/uq_.*_(user|ws)_name/i.test(msg) || /UNIQUE/i.test(msg)) {
      // Race: another concurrent create won the unique index. Return the
      // pre-existing row so the caller can move on.
      const existing = await d
        .select({ id: t.id, name: t.name, tone: t.tone, sortOrder: t.sortOrder })
        .from(t)
        .where(and(eq(t.workspaceId, s.workspaceId), eq(t.name, name)))
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

export async function deleteStatus(kind: Kind, s: Scope, id: string): Promise<void> {
  const t = TABLE[kind];
  const d = db(s.region);
  await d.delete(t).where(and(eq(t.id, id), eq(t.workspaceId, s.workspaceId)));
}
