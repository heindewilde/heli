import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getProject } from '$lib/server/projects-query';
import { deleteProject, updateProject, type UpdateProjectInput } from '$lib/server/saveProject';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const item = await getProject(locals.user.id, locals.user.region, params.id!);
  if (!item) throw error(404, 'not_found');
  return json(item);
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let body: UpdateProjectInput;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  try {
    await updateProject(locals.user.id, locals.user.region, params.id!, body);
  } catch (err) {
    throw error(400, (err as Error).message);
  }
  const fresh = await getProject(locals.user.id, locals.user.region, params.id!);
  if (!fresh) throw error(404, 'not_found');
  return json(fresh);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  await deleteProject(locals.user.id, locals.user.region, params.id!);
  return new Response(null, { status: 204 });
};
