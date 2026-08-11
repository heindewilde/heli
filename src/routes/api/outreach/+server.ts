import { error, json, type RequestHandler } from '@sveltejs/kit';
import { requireScope } from '$lib/server/scope';
import { jsonWithEtag } from '$lib/server/cache';
import { createTemplate, listTemplates, type ListFilters } from '$lib/server/outreach';
import { isOutreachPlatform } from '$lib/outreach/platforms';

function archivedFilter(v: string | null): ListFilters['archived'] {
  return v === 'archived' || v === 'all' ? v : 'active';
}

export const GET: RequestHandler = async ({ request, url, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const platform = url.searchParams.get('platform');
  const items = await listTemplates(s, {
    q: url.searchParams.get('q') ?? undefined,
    platform: isOutreachPlatform(platform) ? platform : undefined,
    archived: archivedFilter(url.searchParams.get('archived'))
  });
  return jsonWithEtag(request, { items });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  try {
    const result = await createTemplate(s, body as never);
    return json(result, { status: 201 });
  } catch (err) {
    throw error(400, (err as Error).message);
  }
};
