import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { listTagsWithCounts, isTagScope } from '$lib/server/tags';

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const scope = url.searchParams.get('scope') ?? 'person';
  if (!isTagScope(scope)) return apiError('invalid_request', 'scope must be person or company.', 400);
  return apiOk(await listTagsWithCounts(s, scope));
};
