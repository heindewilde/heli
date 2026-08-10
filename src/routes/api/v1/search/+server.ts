import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { searchAll } from '$lib/server/search';

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireApiScope(locals, 'read');
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (!q) return apiError('invalid_request', 'A `q` parameter is required.', 400);
  const perKind = Math.min(Number(url.searchParams.get('perKind')) || 5, 25);
  return apiOk(await searchAll(s, q, perKind));
};
