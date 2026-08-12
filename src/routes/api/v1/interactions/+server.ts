import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { getInteraction, listInteractions } from '$lib/server/interactions-query';
import { createInteraction, isInteractionType } from '$lib/server/saveInteraction';
import { idempotencyKeyFrom, withIdempotency } from '$lib/server/idempotency';

/**
 * Interactions over the public API.
 *
 * Note there is no cursor here, unlike people and companies. `listInteractions`
 * orders by `occurred_at DESC` and its search branch orders by FTS `rank`, so
 * the `(created_at, id)` cursor in `cursor.ts` does not apply — and a second
 * cursor format for one resource is worse than the honest limit the web already
 * ships. Filters narrow instead, which is how the web list works too.
 */

const MAX_LIMIT = 100;

function parseTs(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, MAX_LIMIT);
  const items = await listInteractions(s, {
    q: url.searchParams.get('q') ?? undefined,
    personId: url.searchParams.get('personId') ?? undefined,
    companyId: url.searchParams.get('companyId') ?? undefined,
    type: url.searchParams.get('type') ?? undefined,
    from: parseTs(url.searchParams.get('from')),
    to: parseTs(url.searchParams.get('to')),
    limit
  });
  return apiOk(items);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'write');
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  if (!isInteractionType(body.type)) {
    return apiError('invalid_request', 'A valid `type` is required.', 400);
  }
  if (typeof body.title !== 'string' || !body.title.trim()) {
    return apiError('invalid_request', '`title` is required.', 400);
  }

  const stringIds = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  // An interaction has no natural dedup key — unlike a person or a company,
  // which collide on (workspace_id, url) — so a replayed create would log the
  // same call twice. This is the endpoint idempotency exists for.
  return withIdempotency(s, idempotencyKeyFrom(request), async () => {
    try {
      const { id } = await createInteraction(s, {
        occurredAt: typeof body.occurredAt === 'number' ? body.occurredAt : Date.now(),
        type: body.type as never,
        title: body.title as string,
        body: typeof body.body === 'string' ? body.body : null,
        companyId: typeof body.companyId === 'string' && body.companyId ? body.companyId : null,
        personIds: stringIds(body.personIds),
        projectIds: stringIds(body.projectIds)
      });

      // The finished row, not `{ id }`. A client that has to re-fetch what it
      // just created spends a second round trip to render something the server
      // already had — the rule `tests/create-returns-row.test.ts` pins for
      // people and companies, and why creating a person costs 3 queries not 11.
      return apiOk(await getInteraction(s, id), { status: 201 });
    } catch (err) {
      return apiError('invalid_request', (err as Error).message, 400);
    }
  });
};
