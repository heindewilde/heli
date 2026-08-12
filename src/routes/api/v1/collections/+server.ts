import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { createCollection, listCollections } from '$lib/server/collections';
import { idempotencyKeyFrom, withIdempotency } from '$lib/server/idempotency';

const ARCHIVED = ['active', 'archived', 'all'] as const;

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const archived = url.searchParams.get('archived') ?? 'active';
  return apiOk(
    await listCollections(s, {
      q: url.searchParams.get('q') ?? undefined,
      archived: ((ARCHIVED as readonly string[]).includes(archived) ? archived : 'active') as never,
      sort: (url.searchParams.get('sort') ?? 'updated') as never,
      limit: Math.min(Number(url.searchParams.get('limit')) || 100, 200)
    })
  );
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return apiError('invalid_request', '`name` is required.', 400);
  }

  return withIdempotency(s, idempotencyKeyFrom(request), async () => {
    try {
      // `description` goes through the markup sanitizer inside
      // `createCollection`, not the plain-text one — it is rendered with
      // `{@html}`. That was a stored-XSS here once already.
      return apiOk(await createCollection(s, body as never), { status: 201 });
    } catch (err) {
      return apiError('invalid_request', (err as Error).message, 400);
    }
  });
};
