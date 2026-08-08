import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { listProjects, searchProjects } from '$lib/server/projects-query';
import { createProject, type ManualProjectInput } from '$lib/server/saveProject';
import {
  PROJECT_STATUSES,
  type ProjectStatus
} from '$lib/server/schema';
import { jsonWithEtag } from '$lib/server/cache';

function isStatusOrAll(v: unknown): v is ProjectStatus | 'all' {
  return v === 'all' || (typeof v === 'string' && (PROJECT_STATUSES as readonly string[]).includes(v));
}

export const GET: RequestHandler = async ({ url, locals, request }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const statusParam = url.searchParams.get('status');
  const personId = url.searchParams.get('personId') ?? undefined;
  const companyId = url.searchParams.get('companyId') ?? undefined;
  const sortParam = url.searchParams.get('sort');

  // Typeahead mode: short list, no extra columns. Used by ProjectPicker.
  if (url.searchParams.get('mode') === 'typeahead' || (Number.isFinite(limitParam) && limitParam <= 20 && !sortParam && !statusParam && !personId && !companyId)) {
    const items = await searchProjects(
      s,
      q,
      Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 8
    );
    return jsonWithEtag(request, { items });
  }

  const status = isStatusOrAll(statusParam) ? statusParam : 'active';
  const sort =
    sortParam === 'recent' ||
    sortParam === 'updated' ||
    sortParam === 'name' ||
    sortParam === 'endDate' ||
    sortParam === 'lastInteraction'
      ? sortParam
      : undefined;

  const items = await listProjects(s, {
    q,
    status,
    personId,
    companyId,
    sort,
    limit: 200
  });
  return jsonWithEtag(request, { items });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: Partial<ManualProjectInput>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!body.name || typeof body.name !== 'string') throw error(400, 'missing_name');
  try {
    const result = await createProject(s, body as ManualProjectInput);
    return json(result, { status: 201 });
  } catch (err) {
    throw error(400, (err as Error).message);
  }
};
