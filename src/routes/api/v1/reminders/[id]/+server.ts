import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { reminders } from '$lib/server/schema';

/**
 * Dismiss one of your own reminders.
 *
 * Filters on `user_id` as well as `workspace_id`. Reminders are personal, so
 * the delete has to agree with the read in `listReminders` — see the note on
 * the private route of the same name.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const s = requireApiScope(locals, 'write');
  const res = await db(s.region)
    .delete(reminders)
    .where(
      and(
        eq(reminders.id, params.id),
        eq(reminders.workspaceId, s.workspaceId),
        eq(reminders.userId, s.userId)
      )
    );
  if (res.rowsAffected === 0) return apiError('not_found', 'No such reminder.', 404);
  return apiOk({ id: params.id, deleted: true });
};
