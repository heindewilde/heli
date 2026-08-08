import { requireScope } from '$lib/server/scope';
import { error, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { reminders } from '$lib/server/schema';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const d = db(locals.user.region);
  await d.delete(reminders).where(and(eq(reminders.id, params.id!), eq(reminders.workspaceId, s.workspaceId)));
  return new Response(null, { status: 204 });
};
