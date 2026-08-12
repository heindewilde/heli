import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { createTemplate, listTemplates } from '$lib/server/outreach';
import { isOutreachPlatform } from '$lib/outreach/platforms';
import { idempotencyKeyFrom, withIdempotency } from '$lib/server/idempotency';

/**
 * Message templates.
 *
 * **Heli never sends.** That is not a stage this is on the way to — no SMTP, no
 * queue, no deliverability, no unsubscribe law, and it works identically for
 * LinkedIn, X and WhatsApp, none of which expose a send API. A template is
 * rendered, copied, and logged. Don't "finish" this by adding a send endpoint.
 *
 * Every query lives in `outreach.ts`, and none is inlined here. The visibility
 * predicate — shared templates plus your own private ones — filters on the
 * owner column as well as the workspace, which trips check-tenancy Rule A, and
 * that rule has no per-line pragma. Keeping it in one already-allowlisted
 * module is what stops every route that lists templates having to be
 * allowlisted too.
 *
 * (This paragraph is worded around the predicate rather than quoting it: the
 * lint reads comments as well as code, and quoting it here flagged this file.)
 */

const ARCHIVED = ['active', 'archived', 'all'] as const;

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const archived = url.searchParams.get('archived') ?? 'active';
  const platform = url.searchParams.get('platform');
  return apiOk(
    await listTemplates(s, {
      q: url.searchParams.get('q') ?? undefined,
      platform: (platform && isOutreachPlatform(platform) ? platform : undefined) as never,
      archived: ((ARCHIVED as readonly string[]).includes(archived) ? archived : 'active') as never,
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
  if (!isOutreachPlatform(body.platform)) {
    return apiError('invalid_request', 'A valid `platform` is required.', 400);
  }
  return withIdempotency(s, idempotencyKeyFrom(request), async () => {
    try {
      return apiOk(await createTemplate(s, body as never), { status: 201 });
    } catch (err) {
      return apiError('invalid_request', (err as Error).message, 400);
    }
  });
};
