import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { createReminder, isReminderKind, listReminders } from '$lib/server/reminders-query';
import { idempotencyKeyFrom, withIdempotency } from '$lib/server/idempotency';

/**
 * Reminders are **personal**, not workspace-shared.
 *
 * `listReminders` filters on `(workspace_id, user_id)` and that is not an
 * optimisation — scoping by workspace alone would drop every colleague's
 * reminders into your list. A device authenticates as one person, so this is
 * exactly the right shape for it, and it is what the mobile Today screen and
 * push notifications both read.
 */

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
  return apiOk(await listReminders(s, { limit }));
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  if (!isReminderKind(body.kind)) {
    return apiError('invalid_request', 'A valid `kind` is required.', 400);
  }
  if (typeof body.refId !== 'string' || !body.refId) {
    return apiError('invalid_request', '`refId` is required.', 400);
  }
  if (typeof body.remindAt !== 'number') {
    return apiError('invalid_request', '`remindAt` must be an epoch in milliseconds.', 400);
  }

  return withIdempotency(s, idempotencyKeyFrom(request), async () => {
    try {
      const created = await createReminder(s, {
        kind: body.kind as never,
        refId: body.refId as string,
        remindAt: body.remindAt as number
      });
      return apiOk(created, { status: 201 });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'ref_not_found') {
        return apiError('not_found', 'No such record to remind about.', 404);
      }
      return apiError('invalid_request', msg, 400);
    }
  });
};
