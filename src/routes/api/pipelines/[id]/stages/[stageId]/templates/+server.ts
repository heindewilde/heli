import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireRole, requireScope } from '$lib/server/scope';
import { listStageTemplates, setStageTemplates } from '$lib/server/outreach';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  try {
    return json({ items: await listStageTemplates(s, params.stageId!) });
  } catch {
    throw error(404, 'not_found');
  }
};

/**
 * Replace a stage's templates, in array order.
 *
 * Admin-only, matching stage delete and reorder: which templates a stage
 * offers is board configuration that every member of the workspace then sees,
 * not the member's own work. Writing a template stays open to members.
 */
export const PUT: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  requireRole(s, 'owner', 'admin');

  let body: { templateIds?: unknown };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  const ids = Array.isArray(body.templateIds)
    ? body.templateIds.filter((v): v is string => typeof v === 'string')
    : [];

  try {
    await setStageTemplates(s, params.stageId!, ids);
  } catch {
    throw error(404, 'not_found');
  }
  return json({ items: await listStageTemplates(s, params.stageId!) });
};
