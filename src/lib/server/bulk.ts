/**
 * The shared half of `POST /api/people/bulk` and `POST /api/companies/bulk`.
 *
 * One endpoint per kind carrying four actions, rather than array variants
 * bolted onto the five existing single-record endpoints. Three reasons, in
 * order of weight:
 *
 *  - Round trips. The cloud runs against remote libSQL, where every statement
 *    is a network hop. Tagging fifty rows through `POST /api/tags` is fifty
 *    requests and roughly a hundred and fifty statements; here it is one
 *    request and three.
 *  - One tenancy decision. Every statement below filters `workspace_id` first
 *    and the id list is only ever a further narrowing, so a stale selection
 *    from another workspace silently resolves to nothing instead of leaking.
 *  - One place to cap the id list, and one place a reviewer looks to see what
 *    a bulk action is allowed to do.
 *
 * Ids the workspace does not own are dropped rather than raising. A selection
 * can go stale between the tick and the click — a colleague deletes a row, a
 * filter change prunes it — and failing the whole action because one of fifty
 * ids no longer resolves would be worse than reporting a smaller count. The
 * response carries the count that actually applied.
 */
import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { people, companies } from './schema';
import { requireRole, type Scope } from './scope';
import { bumpSearchEpoch } from './search';
import { ensureTag, attachTagMany, detachTagMany } from './tags';
import type { TagScope } from './schema';
import { addManyToCollection, removeManyFromCollection } from './collections';
import { addItemToPipeline, removePipelineItemByRef } from './pipelines';
import { getCollectionSync } from './sync';

/**
 * The most rows one request may touch.
 *
 * Not a product limit so much as a shape limit: the list pages load fifty at a
 * time and "select all" covers what is loaded, so reaching two hundred already
 * means three deliberate Load More presses. It also bounds the `inArray` bind
 * count well inside SQLite's parameter ceiling.
 */
export const MAX_BULK_IDS = 200;

export type BulkAction =
  | { kind: 'patch'; fields: { priority?: unknown; statusId?: unknown } }
  | { kind: 'tag'; op: 'add' | 'remove'; name?: string; tagId?: string }
  | { kind: 'collection'; op: 'add' | 'remove'; collectionId: string }
  | { kind: 'delete' };

export type BulkResult = { count: number; tagId?: string };

/** Same coercion as the single-record PATCH handlers: anything else is null. */
function coercePriority(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return n === 1 || n === 2 || n === 3 ? n : null;
}

export function parseBulkBody(raw: unknown): { ids: string[]; action: BulkAction } {
  const body = raw as { ids?: unknown; action?: unknown };
  if (!Array.isArray(body.ids)) throw error(400, 'missing_ids');
  const ids = [...new Set(body.ids.filter((x): x is string => typeof x === 'string' && !!x))];
  if (ids.length === 0) throw error(400, 'missing_ids');
  if (ids.length > MAX_BULK_IDS) throw error(400, 'too_many_ids');

  const a = body.action as Record<string, unknown> | undefined;
  if (!a || typeof a !== 'object') throw error(400, 'missing_action');

  switch (a.kind) {
    case 'patch': {
      const fields = (a.fields ?? {}) as Record<string, unknown>;
      // An empty patch would be a no-op that still reported a count, which
      // reads as "it worked" for an action that did nothing.
      if (!('priority' in fields) && !('statusId' in fields)) throw error(400, 'no_updates');
      return { ids, action: { kind: 'patch', fields } };
    }
    case 'tag': {
      if (a.op !== 'add' && a.op !== 'remove') throw error(400, 'invalid_op');
      const name = typeof a.name === 'string' ? a.name : undefined;
      const tagId = typeof a.tagId === 'string' ? a.tagId : undefined;
      if (!name && !tagId) throw error(400, 'missing_tag');
      return { ids, action: { kind: 'tag', op: a.op, name, tagId } };
    }
    case 'collection': {
      if (a.op !== 'add' && a.op !== 'remove') throw error(400, 'invalid_op');
      if (typeof a.collectionId !== 'string' || !a.collectionId)
        throw error(400, 'missing_collection');
      return { ids, action: { kind: 'collection', op: a.op, collectionId: a.collectionId } };
    }
    case 'delete':
      return { ids, action: { kind: 'delete' } };
    default:
      throw error(400, 'invalid_action');
  }
}

export async function runBulkAction(
  s: Scope,
  scope: TagScope,
  ids: string[],
  action: BulkAction
): Promise<BulkResult> {
  const d = db(s.region);
  const table = scope === 'person' ? people : companies;

  switch (action.kind) {
    case 'patch': {
      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      if ('priority' in action.fields) updates.priority = coercePriority(action.fields.priority);
      if ('statusId' in action.fields) {
        const v = action.fields.statusId;
        updates.statusId = v == null || v === '' ? null : String(v);
      }
      const res = await d
        .update(table)
        .set(updates)
        .where(and(eq(table.workspaceId, s.workspaceId), inArray(table.id, ids)));
      // Neither priority nor status is an FTS column, so no epoch bump here.
      return { count: Number(res.rowsAffected ?? 0) };
    }

    case 'tag': {
      // `ensureTag` is idempotent by slug, so "apply a tag by name" creates it
      // on first use and finds it every time after — the same primitive the
      // per-row adder uses, called once instead of N times.
      let tagId = action.tagId;
      if (!tagId) {
        try {
          tagId = (await ensureTag(s, scope, action.name!)).id;
        } catch (err) {
          throw error(400, (err as Error).message);
        }
      }
      try {
        const touched =
          action.op === 'add'
            ? await attachTagMany(s, scope, ids, tagId)
            : await detachTagMany(s, scope, ids, tagId);
        return { count: touched.length, tagId };
      } catch (err) {
        throw error(400, (err as Error).message);
      }
    }

    case 'collection': {
      let touched: string[];
      try {
        touched =
          action.op === 'add'
            ? await addManyToCollection(s, action.collectionId, scope, ids)
            : await removeManyFromCollection(s, action.collectionId, scope, ids);
      } catch (err) {
        throw error(400, (err as Error).message);
      }
      // A collection may mirror a pipeline. The sync is resolved once for the
      // whole batch — the single-item endpoint resolves it per call, which is
      // the round trip this endpoint exists to avoid.
      const sync = await getCollectionSync(s, action.collectionId);
      if (sync) {
        for (const refId of touched) {
          try {
            if (action.op === 'add') {
              await addItemToPipeline(s, sync.pipelineId, { kind: scope, refId });
            } else {
              await removePipelineItemByRef(s, sync.pipelineId, scope, refId);
            }
          } catch {
            /* already in, or already out */
          }
        }
      }
      return { count: touched.length };
    }

    case 'delete': {
      // Deleting up to two hundred records in one press is wide-blast-radius
      // in the same way `DELETE /api/statuses` and `DELETE /api/tags/[id]`
      // are, so it is the one action here that is not open to members.
      requireRole(s, 'owner', 'admin');
      const res = await d
        .delete(table)
        .where(and(eq(table.workspaceId, s.workspaceId), inArray(table.id, ids)));
      const count = Number(res.rowsAffected ?? 0);
      // The FTS triggers have removed the rows; the cached search results have
      // not heard about it.
      if (count > 0) bumpSearchEpoch(s.workspaceId);
      return { count };
    }
  }
}
