import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { attachPerson, detachPerson } from '$lib/server/saveInteraction';
import { getInteraction } from '$lib/server/interactions-query';

/**
 * Attach and detach a person on an existing interaction.
 *
 * Both helpers check workspace ownership of the interaction *and* validate the
 * person id against the same workspace, so there is nothing to re-check here.
 * `attachPerson` is already idempotent (`onConflictDoNothing` against the
 * composite key), which is what an offline outbox replaying the same attach
 * twice needs.
 */

async function personIdFrom(request: Request): Promise<string | null> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return typeof body.personId === 'string' && body.personId ? body.personId : null;
  } catch {
    return null;
  }
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const s = requireApiScope(locals, 'write');
  const personId = await personIdFrom(request);
  if (!personId) return apiError('invalid_request', '`personId` is required.', 400);

  try {
    await attachPerson(s, params.id, personId);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') return apiError('not_found', 'No such interaction.', 404);
    if (msg === 'person_not_found') return apiError('not_found', 'No such person.', 404);
    return apiError('invalid_request', msg, 400);
  }
  return apiOk(await getInteraction(s, params.id));
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  const s = requireApiScope(locals, 'write');
  const personId = await personIdFrom(request);
  if (!personId) return apiError('invalid_request', '`personId` is required.', 400);

  try {
    await detachPerson(s, params.id, personId);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') return apiError('not_found', 'No such interaction.', 404);
    return apiError('invalid_request', msg, 400);
  }
  return apiOk(await getInteraction(s, params.id));
};
