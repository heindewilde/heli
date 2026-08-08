import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { createStatus, deleteStatus, listStatuses } from '$lib/server/statuses';
import type { Kind } from '$lib/server/classify';

// One endpoint serves both scopes via `?scope=person|company`.
function parseScope(v: string | null): Kind {
  if (v === 'person' || v === 'company') return v;
  throw error(400, 'bad_scope');
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const scope = parseScope(url.searchParams.get('scope'));
  const items = await listStatuses(scope, s);
  return json({ items });
};

export const POST: RequestHandler = async ({ url, request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const scope = parseScope(url.searchParams.get('scope'));
  let body: { name?: unknown; tone?: unknown };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  try {
    const row = await createStatus(scope, s, {
      name: String(body.name ?? ''),
      tone: String(body.tone ?? 'gray')
    });
    return json(row, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'missing_name') throw error(400, 'missing_name');
    throw err;
  }
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const scope = parseScope(url.searchParams.get('scope'));
  const id = url.searchParams.get('id');
  if (!id) throw error(400, 'missing_id');
  await deleteStatus(scope, s, id);
  return new Response(null, { status: 204 });
};
