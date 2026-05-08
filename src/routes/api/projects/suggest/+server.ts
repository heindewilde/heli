import { error, json, type RequestHandler } from '@sveltejs/kit';
import { suggestProjectsFor } from '$lib/server/projects-query';

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const personIds = parseList(url.searchParams.get('personIds'));
  const companyId = url.searchParams.get('companyId') || null;
  const exclude = parseList(url.searchParams.get('exclude'));

  const items = await suggestProjectsFor(locals.user.id, locals.user.region, {
    personIds,
    companyId,
    exclude
  });
  return json({ items });
};
