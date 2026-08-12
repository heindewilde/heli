import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import { sanitize, sanitizePlainText } from './sanitize';
import {
  outreachTemplates,
  pipelineStageTemplates,
  pipelineStages,
  pipelines,
  OUTREACH_VISIBILITIES,
  type OutreachVisibility
} from './schema';
import type { Scope } from './scope';
import { isOutreachPlatform, isRichPlatform, PLATFORMS, type OutreachPlatform } from '$lib/outreach/platforms';

/**
 * Every query that touches outreach templates lives here, and that is
 * deliberate.
 *
 * A template is workspace-owned unless it is private, in which case it belongs
 * to its author — so listing filters on `user_id` as well as `workspace_id`.
 * That trips `check-tenancy.ts` Rule A, which has no per-line escape hatch, so
 * this file is in `ALLOW_FILES`. Keeping the predicate in one module is what
 * keeps that exemption to one file instead of every route that lists templates.
 */

export type OutreachTemplate = {
  id: string;
  name: string;
  platform: OutreachPlatform;
  subject: string | null;
  body: string;
  visibility: OutreachVisibility;
  nudgeDays: number | null;
  isArchived: number;
  userId: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * Shared templates, plus your own private ones.
 *
 * `user_id` is doing two different jobs in this table and this is the seam:
 * on a shared row it is created-by attribution and must not filter anything;
 * on a private row it is real ownership and must.
 */
function visibleTo(s: Scope) {
  return and(
    eq(outreachTemplates.workspaceId, s.workspaceId),
    or(eq(outreachTemplates.visibility, 'shared'), eq(outreachTemplates.userId, s.userId))
  );
}

export type ListFilters = {
  q?: string;
  platform?: OutreachPlatform;
  archived?: 'active' | 'archived' | 'all';
  limit?: number;
};

function listConditions(s: Scope, filters: ListFilters) {
  const archived = filters.archived ?? 'active';
  const conditions = [visibleTo(s)];
  if (archived !== 'all') {
    conditions.push(eq(outreachTemplates.isArchived, archived === 'archived' ? 1 : 0));
  }
  if (filters.platform) conditions.push(eq(outreachTemplates.platform, filters.platform));
  if (filters.q?.trim()) {
    // The library is tens of rows, not thousands — a LIKE beats standing up a
    // sixth FTS index and its triggers for it.
    const like = `%${filters.q.trim().toLowerCase()}%`;
    conditions.push(sql`lower(${outreachTemplates.name}) LIKE ${like}`);
  }
  return and(...conditions);
}

export async function listTemplates(
  s: Scope,
  filters: ListFilters = {}
): Promise<OutreachTemplate[]> {
  const rows = await db(s.region)
    .select()
    .from(outreachTemplates)
    .where(listConditions(s, filters))
    .orderBy(asc(outreachTemplates.name))
    .limit(Math.min(filters.limit ?? 200, 500));

  return rows as OutreachTemplate[];
}

/** Just enough of a template to name it in a menu. */
export type TemplateSummary = { id: string; name: string; platform: string };

/**
 * The same query as `listTemplates` with a three-column projection.
 *
 * This exists because the root layout runs it on **every authenticated request
 * in the app** to populate the command palette, and the unprojected version was
 * pulling every template `body` across the wire to throw them away. `body` is
 * capped at 20,000 chars, so the worst case was megabytes decoded into strings
 * and discarded, per navigation, against remote libSQL. The comment in
 * `+layout.server.ts` promising "never a body" was true of what reached the
 * browser and false of what reached the server.
 */
export async function listTemplateSummaries(
  s: Scope,
  filters: ListFilters = {}
): Promise<TemplateSummary[]> {
  return db(s.region)
    .select({
      id: outreachTemplates.id,
      name: outreachTemplates.name,
      platform: outreachTemplates.platform
    })
    .from(outreachTemplates)
    .where(listConditions(s, filters))
    .orderBy(asc(outreachTemplates.name))
    .limit(Math.min(filters.limit ?? 200, 500));
}

/**
 * A count, for the "showing N of M" line. The page used to get M by running the
 * unfiltered list a second time and reading `.length` — a full second
 * `SELECT *`, bodies included, to produce one integer.
 */
export async function countTemplates(s: Scope, filters: ListFilters = {}): Promise<number> {
  const row = await db(s.region)
    .select({ n: sql<number>`count(*)` })
    .from(outreachTemplates)
    .where(listConditions(s, filters))
    .get();
  return row?.n ?? 0;
}

export async function getTemplate(s: Scope, id: string): Promise<OutreachTemplate | null> {
  const row = await db(s.region)
    .select()
    .from(outreachTemplates)
    .where(and(eq(outreachTemplates.id, id), visibleTo(s)))
    .get();
  return (row as OutreachTemplate) ?? null;
}

export type TemplateInput = {
  name: string;
  platform: string;
  subject?: string | null;
  body?: string | null;
  visibility?: string;
  nudgeDays?: number | null;
};

function isVisibility(v: unknown): v is OutreachVisibility {
  return typeof v === 'string' && (OUTREACH_VISIBILITIES as readonly string[]).includes(v);
}

/**
 * Normalise the fields that depend on the platform.
 *
 * A subject on a platform that has none would be authored, stored, and then
 * silently never used; and only email keeps its markup, because every other
 * composer accepts plain text and showing formatting that cannot survive the
 * paste is worse than not offering it.
 */
function shapeForPlatform(platform: OutreachPlatform, subject: unknown, body: unknown) {
  const spec = PLATFORMS[platform];
  return {
    subject: spec.hasSubject && typeof subject === 'string' ? sanitizePlainText(subject, 400) || null : null,
    body: isRichPlatform(platform)
      ? sanitize(String(body ?? ''))
      : sanitizePlainText(String(body ?? ''), 20_000)
  };
}

function shapeNudge(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.floor(n), 365);
}

export async function createTemplate(s: Scope, input: TemplateInput): Promise<{ id: string }> {
  const name = sanitizePlainText(input.name ?? '', 200);
  if (!name) throw new Error('missing_name');
  if (!isOutreachPlatform(input.platform)) throw new Error('invalid_platform');

  const { subject, body } = shapeForPlatform(input.platform, input.subject, input.body);
  const id = createId();
  const now = Date.now();

  await db(s.region).insert(outreachTemplates).values({
    id,
    workspaceId: s.workspaceId,
    userId: s.userId,
    name,
    platform: input.platform,
    subject,
    body,
    visibility: isVisibility(input.visibility) ? input.visibility : 'shared',
    nudgeDays: shapeNudge(input.nudgeDays),
    isArchived: 0,
    createdAt: now,
    updatedAt: now
  });
  return { id };
}

export type UpdateTemplateInput = Partial<TemplateInput> & { isArchived?: boolean };

export async function updateTemplate(
  s: Scope,
  id: string,
  input: UpdateTemplateInput
): Promise<void> {
  const existing = await getTemplate(s, id);
  if (!existing) throw new Error('not_found');

  const updates: Record<string, unknown> = { updatedAt: Date.now() };

  if (input.name !== undefined) {
    const name = sanitizePlainText(input.name ?? '', 200);
    if (!name) throw new Error('missing_name');
    updates.name = name;
  }

  // The platform decides how subject and body are shaped, so a change to any
  // of the three re-derives all of them against the platform that will apply.
  const platform = input.platform !== undefined ? input.platform : existing.platform;
  if (!isOutreachPlatform(platform)) throw new Error('invalid_platform');
  if (input.platform !== undefined || input.subject !== undefined || input.body !== undefined) {
    const shaped = shapeForPlatform(
      platform,
      input.subject !== undefined ? input.subject : existing.subject,
      input.body !== undefined ? input.body : existing.body
    );
    updates.platform = platform;
    updates.subject = shaped.subject;
    updates.body = shaped.body;
  }

  if (input.visibility !== undefined) {
    if (!isVisibility(input.visibility)) throw new Error('invalid_visibility');
    updates.visibility = input.visibility;
  }
  if (input.nudgeDays !== undefined) updates.nudgeDays = shapeNudge(input.nudgeDays);
  if (input.isArchived !== undefined) updates.isArchived = input.isArchived ? 1 : 0;

  await db(s.region)
    .update(outreachTemplates)
    .set(updates)
    .where(and(eq(outreachTemplates.id, id), visibleTo(s)));
}

export async function deleteTemplate(s: Scope, id: string): Promise<void> {
  const existing = await getTemplate(s, id);
  if (!existing) throw new Error('not_found');
  await db(s.region)
    .delete(outreachTemplates)
    .where(and(eq(outreachTemplates.id, id), visibleTo(s)));
}

/* ── Pipeline stage attachment ─────────────────────────────────────────────
 *
 * `pipeline_stage_templates` carries no workspace_id, because
 * `pipeline_stages` carries none either. Scope reaches it by joining through
 * `pipelines`, and every function here does that — otherwise a member of one
 * workspace could attach templates by guessing a stage id.
 */

async function stageInWorkspace(s: Scope, stageId: string): Promise<boolean> {
  const row = await db(s.region)
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
    .where(and(eq(pipelineStages.id, stageId), eq(pipelines.workspaceId, s.workspaceId)))
    .get();
  return !!row;
}

export async function listStageTemplates(s: Scope, stageId: string): Promise<OutreachTemplate[]> {
  if (!(await stageInWorkspace(s, stageId))) throw new Error('not_found');
  const rows = await db(s.region)
    .select({ t: outreachTemplates })
    .from(pipelineStageTemplates)
    .innerJoin(outreachTemplates, eq(outreachTemplates.id, pipelineStageTemplates.templateId))
    .where(and(eq(pipelineStageTemplates.stageId, stageId), visibleTo(s)))
    .orderBy(asc(pipelineStageTemplates.position));
  return rows.map((r) => r.t as OutreachTemplate);
}

/**
 * Every stage's attached template ids for one pipeline, keyed by stage.
 *
 * One query for the whole board rather than one per stage — the pipeline page
 * renders every stage at once, and the cloud runs against remote libSQL where
 * the metric that matters is the round-trip count.
 */
export type StageTemplate = { id: string; name: string; platform: OutreachPlatform };

export async function stageTemplateMap(
  s: Scope,
  pipelineId: string
): Promise<Record<string, StageTemplate[]>> {
  const rows = await db(s.region)
    .select({
      stageId: pipelineStageTemplates.stageId,
      id: outreachTemplates.id,
      name: outreachTemplates.name,
      platform: outreachTemplates.platform
    })
    .from(pipelineStageTemplates)
    .innerJoin(pipelineStages, eq(pipelineStages.id, pipelineStageTemplates.stageId))
    .innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
    .innerJoin(outreachTemplates, eq(outreachTemplates.id, pipelineStageTemplates.templateId))
    .where(and(eq(pipelines.id, pipelineId), eq(pipelines.workspaceId, s.workspaceId), visibleTo(s)))
    .orderBy(asc(pipelineStageTemplates.position));

  const out: Record<string, StageTemplate[]> = {};
  for (const r of rows) {
    (out[r.stageId] ??= []).push({
      id: r.id,
      name: r.name,
      platform: r.platform as OutreachPlatform
    });
  }
  return out;
}

/**
 * Replace a stage's template list. Order is the array order.
 *
 * Ids are filtered against what the caller can actually see first, so attaching
 * cannot be used to probe for another workspace's template ids — an unknown id
 * is dropped rather than reported.
 */
export async function setStageTemplates(
  s: Scope,
  stageId: string,
  templateIds: string[]
): Promise<void> {
  if (!(await stageInWorkspace(s, stageId))) throw new Error('not_found');

  const unique = [...new Set(templateIds)];
  const d = db(s.region);
  await d.delete(pipelineStageTemplates).where(eq(pipelineStageTemplates.stageId, stageId));
  if (unique.length === 0) return;

  const visible = await d
    .select({ id: outreachTemplates.id })
    .from(outreachTemplates)
    .where(and(inArray(outreachTemplates.id, unique), visibleTo(s)));
  const allowed = new Set(visible.map((r) => r.id));

  const rows = unique
    .filter((id) => allowed.has(id))
    .map((templateId, position) => ({ stageId, templateId, position }));
  if (rows.length > 0) await d.insert(pipelineStageTemplates).values(rows);
}
