import { requireScope } from '$lib/server/scope';
import { error, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { reminders } from '$lib/server/schema';

/**
 * Dismiss one of *your* reminders.
 *
 * The `user_id` filter is load-bearing and was missing: this used to match on
 * `(id, workspace_id)` alone, so a member holding another member's reminder id
 * could delete it. Reminders are personal — `listReminders` filters on both
 * columns for exactly that reason, and `PERSONAL_TABLES` exists to stop them
 * being handed to the workspace owner on member removal. The delete has to
 * agree with the read.
 *
 * Not readily exploitable, because ids are only ever returned to their owner —
 * but "you would have to guess an id first" is not the property we want to be
 * relying on.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const d = db(locals.user.region);
  await d
    .delete(reminders)
    .where(
      and(
        eq(reminders.id, params.id!),
        eq(reminders.workspaceId, s.workspaceId),
        eq(reminders.userId, s.userId)
      )
    );
  return new Response(null, { status: 204 });
};
