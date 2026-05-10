import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  listCollections,
  searchCollections,
  createCollection,
  type ManualCollectionInput
} from '$lib/server/collections';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const q = url.searchParams.get('q')?.trim() ?? '';
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const archivedParam = url.searchParams.get('archived');

  if (
    url.searchParams.get('mode') === 'typeahead' ||
    (Number.isFinite(limitParam) && limitParam <= 20 && !archivedParam)
  ) {
    const items = await searchCollections(
      locals.user.id,
      locals.user.region,
      q,
      Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 8
    );
    return json({ items });
  }

  const archived =
    archivedParam === 'archived' || archivedParam === 'all' ? archivedParam : 'active';
  const items = await listCollections(locals.user.id, locals.user.region, {
    q,
    archived,
    limit: 200
  });
  return json({ items });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let body: Partial<ManualCollectionInput>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!body.name || typeof body.name !== 'string') throw error(400, 'missing_name');
  try {
    const result = await createCollection(
      locals.user.id,
      locals.user.region,
      body as ManualCollectionInput
    );
    return json(result, { status: 201 });
  } catch (err) {
    throw error(400, (err as Error).message);
  }
};
