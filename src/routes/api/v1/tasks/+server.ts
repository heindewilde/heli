import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { createTask, listTasksForEntity } from '$lib/server/tasks';
import { MEMBER_KINDS } from '$lib/server/schema';
import { idempotencyKeyFrom, withIdempotency } from '$lib/server/idempotency';

/**
 * Tasks are shared, unlike reminders — "call them back" is workspace work, not
 * a private note to self. They hang off one record, so the list is always
 * scoped to a `(kind, refId)` pair rather than being a workspace-wide feed.
 */

function isMemberKind(v: unknown): v is 'person' | 'company' {
  return typeof v === 'string' && (MEMBER_KINDS as readonly string[]).includes(v);
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const kind = url.searchParams.get('kind');
  const refId = url.searchParams.get('refId');
  if (!isMemberKind(kind) || !refId) {
    return apiError('invalid_request', '`kind` and `refId` are required.', 400);
  }
  return apiOk(await listTasksForEntity(s, kind, refId));
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  if (!isMemberKind(body.kind) || typeof body.refId !== 'string' || !body.refId) {
    return apiError('invalid_request', '`kind` and `refId` are required.', 400);
  }
  if (typeof body.title !== 'string' || !body.title.trim()) {
    return apiError('invalid_request', '`title` is required.', 400);
  }

  return withIdempotency(s, idempotencyKeyFrom(request), async () => {
    try {
      const task = await createTask(s, {
        kind: body.kind as never,
        refId: body.refId as string,
        title: body.title as string,
        dueAt: typeof body.dueAt === 'number' ? body.dueAt : null
      });
      return apiOk(task, { status: 201 });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'not_found') return apiError('not_found', 'No such record.', 404);
      return apiError('invalid_request', msg, 400);
    }
  });
};
