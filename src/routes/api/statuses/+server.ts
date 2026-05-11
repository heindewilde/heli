import { error, json, type RequestHandler } from '@sveltejs/kit';
import { createStatus, deleteStatus, listStatuses, type StatusScope } from '$lib/server/statuses';

// One endpoint serves both scopes via `?scope=person|company`. Keeps the
// client simple and avoids two near-identical route files.
function parseScope(v: string | null): StatusScope {
  if (v === 'person' || v === 'company') return v;
  throw error(400, 'bad_scope');
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const scope = parseScope(url.searchParams.get('scope'));
  const items = await listStatuses(scope, locals.user.id, locals.user.region);
  return json({ items });
};

export const POST: RequestHandler = async ({ url, request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const scope = parseScope(url.searchParams.get('scope'));
  let body: { name?: unknown; tone?: unknown };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  try {
    const row = await createStatus(scope, locals.user.id, locals.user.region, {
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
  const scope = parseScope(url.searchParams.get('scope'));
  const id = url.searchParams.get('id');
  if (!id) throw error(400, 'missing_id');
  await deleteStatus(scope, locals.user.id, locals.user.region, id);
  return new Response(null, { status: 204 });
};
