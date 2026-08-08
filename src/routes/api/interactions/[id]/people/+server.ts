import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { attachPerson, detachPerson } from '$lib/server/saveInteraction';

async function readPersonId(request: Request): Promise<string> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (typeof body.personId !== 'string' || !body.personId) throw error(400, 'missing_personId');
  return body.personId;
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const personId = await readPersonId(request);
  try {
    await attachPerson(s, params.id!, personId);
  } catch (err) {
    throw error(404, (err as Error).message);
  }
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, params, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const personId = await readPersonId(request);
  try {
    await detachPerson(s, params.id!, personId);
  } catch (err) {
    throw error(404, (err as Error).message);
  }
  return json({ ok: true });
};
