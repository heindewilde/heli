import { error, json, type RequestHandler } from '@sveltejs/kit';
import { listInteractions } from '$lib/server/interactions-query';
import { createInteraction, isInteractionType } from '$lib/server/saveInteraction';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '200', 10) || 200, 500);
  const items = await listInteractions(locals.user.id, locals.user.region, {
    q: url.searchParams.get('q') ?? undefined,
    personId: url.searchParams.get('personId') ?? undefined,
    companyId: url.searchParams.get('companyId') ?? undefined,
    type: url.searchParams.get('type') ?? undefined,
    from: parseTs(url.searchParams.get('from')),
    to: parseTs(url.searchParams.get('to')),
    limit
  });
  return json({ items });
};

function parseTs(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!isInteractionType(body.type)) throw error(400, 'invalid_type');
  if (typeof body.title !== 'string' || !body.title.trim()) throw error(400, 'missing_title');
  const occurredAt = typeof body.occurredAt === 'number' ? body.occurredAt : Date.now();
  const personIds = Array.isArray(body.personIds)
    ? (body.personIds as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];
  try {
    const result = await createInteraction(locals.user.id, locals.user.region, {
      occurredAt,
      type: body.type,
      title: body.title,
      body: typeof body.body === 'string' ? body.body : null,
      companyId: typeof body.companyId === 'string' && body.companyId ? body.companyId : null,
      personIds
    });
    return json(result, { status: 201 });
  } catch (err) {
    throw error(400, (err as Error).message);
  }
};
