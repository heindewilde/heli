import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { MEMBER_KINDS, type MemberKind } from '$lib/server/schema';
import { createTask, listTasksForEntity } from '$lib/server/tasks';
import { jsonWithEtag } from '$lib/server/cache';

function isMemberKind(v: unknown): v is MemberKind {
  return typeof v === 'string' && (MEMBER_KINDS as readonly string[]).includes(v);
}

export const GET: RequestHandler = async ({ request, url, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  const kind = url.searchParams.get('kind');
  const refId = url.searchParams.get('refId');
  if (!isMemberKind(kind)) throw error(400, 'invalid_kind');
  if (!refId) throw error(400, 'missing_refId');
  const items = await listTasksForEntity(s, kind, refId);
  return jsonWithEtag(request, { items });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  let body: { kind?: unknown; refId?: unknown; title?: unknown; dueAt?: unknown };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (!isMemberKind(body.kind)) throw error(400, 'invalid_kind');
  if (typeof body.refId !== 'string' || !body.refId) throw error(400, 'missing_refId');
  if (typeof body.title !== 'string' || !body.title.trim()) throw error(400, 'missing_title');

  let dueAt: number | null = null;
  if (body.dueAt != null) {
    if (typeof body.dueAt === 'number') {
      dueAt = body.dueAt;
    } else if (typeof body.dueAt === 'string') {
      dueAt = new Date(body.dueAt).getTime();
    } else {
      throw error(400, 'invalid_due_at');
    }
    if (!Number.isFinite(dueAt)) throw error(400, 'invalid_due_at');
  }

  try {
    const task = await createTask(s, {
      kind: body.kind,
      refId: body.refId,
      title: body.title,
      dueAt
    });
    return json(task, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'not_found') throw error(404, 'ref_not_found');
    if (msg === 'missing_title') throw error(400, 'missing_title');
    throw error(400, msg || 'bad_request');
  }
};
