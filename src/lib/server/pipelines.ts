import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import {
  pipelines,
  pipelineStages,
  pipelineItems,
  pipelineItemEvents,
  people,
  companies,
  collections,
  collectionItems,
  STAGE_KINDS,
  PIPELINE_VIEWS,
  type Pipeline,
  type PipelineStage,
  type MemberKind,
  type StageKind,
  type PipelineView
} from './schema';
import { ftsQuery } from './search';
import { sanitizePlainText } from './sanitize';
import { colorToKind } from '$lib/stageColors';
import type { Scope } from './scope';

export function isStageKind(v: unknown): v is StageKind {
  return typeof v === 'string' && (STAGE_KINDS as readonly string[]).includes(v);
}

export function isPipelineView(v: unknown): v is PipelineView {
  return typeof v === 'string' && (PIPELINE_VIEWS as readonly string[]).includes(v);
}

export function isMemberKind(v: unknown): v is MemberKind {
  return v === 'person' || v === 'company';
}

// ──────────────────────────────────────────────────────────────────────────────
// Pipelines

export type PipelineListRow = {
  id: string;
  name: string;
  description: string | null;
  defaultView: PipelineView;
  isArchived: number;
  createdAt: number;
  updatedAt: number;
  openCount: number;
  wonCount: number;
  lostCount: number;
  stageCount: number;
};

export type PipelineListFilters = {
  q?: string;
  archived?: 'active' | 'archived' | 'all';
  sort?: 'updated' | 'recent' | 'name';
  limit?: number;
};

export async function listPipelines(
  s: Scope,
  filters: PipelineListFilters = {}
): Promise<PipelineListRow[]> {
  const d = db(s.region);
  const limit = Math.min(filters.limit ?? 200, 500);
  const fts = filters.q ? ftsQuery(filters.q) : null;
  const archived = filters.archived ?? 'active';

  const archivedClause =
    archived === 'all'
      ? sql``
      : archived === 'archived'
        ? sql`AND p.is_archived = 1`
        : sql`AND p.is_archived = 0`;

  const ftsClause = fts
    ? sql`AND p.id IN (
        SELECT pp.id FROM pipelines pp
        JOIN pipelines_fts f ON f.rowid = pp.rowid
        WHERE pp.workspace_id = ${s.workspaceId} AND f.pipelines_fts MATCH ${fts}
      )`
    : sql``;

  const sort = filters.sort ?? 'updated';
  const orderClause =
    sort === 'name'
      ? sql`ORDER BY p.name ASC`
      : sort === 'recent'
        ? sql`ORDER BY p.created_at DESC`
        : sql`ORDER BY p.updated_at DESC`;

  const rows = await d.all<PipelineListRow>(sql`
    SELECT
      p.id, p.name, p.description,
      p.default_view AS defaultView,
      p.is_archived AS isArchived,
      p.created_at AS createdAt, p.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM pipeline_items pi
         JOIN pipeline_stages ps ON ps.id = pi.stage_id
         WHERE pi.pipeline_id = p.id AND ps.kind = 'open') AS openCount,
      (SELECT COUNT(*) FROM pipeline_items pi
         JOIN pipeline_stages ps ON ps.id = pi.stage_id
         WHERE pi.pipeline_id = p.id AND ps.kind = 'won') AS wonCount,
      (SELECT COUNT(*) FROM pipeline_items pi
         JOIN pipeline_stages ps ON ps.id = pi.stage_id
         WHERE pi.pipeline_id = p.id AND ps.kind = 'lost') AS lostCount,
      (SELECT COUNT(*) FROM pipeline_stages WHERE pipeline_id = p.id) AS stageCount
    FROM pipelines p
    WHERE p.workspace_id = ${s.workspaceId}
      ${archivedClause}
      ${ftsClause}
    ${orderClause}
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    ...r,
    defaultView: (r.defaultView as PipelineView) ?? 'kanban',
    isArchived: Number(r.isArchived ?? 0),
    openCount: Number(r.openCount ?? 0),
    wonCount: Number(r.wonCount ?? 0),
    lostCount: Number(r.lostCount ?? 0),
    stageCount: Number(r.stageCount ?? 0)
  }));
}

export type PipelineItemMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  domain?: string | null;
  role?: string | null;
};

export type PipelineItemRow = {
  id: string;
  kind: MemberKind;
  refId: string;
  stageId: string;
  enteredStageAt: number;
  note: string | null;
  valueCents: number | null;
  currency: string | null;
  createdAt: number;
  updatedAt: number;
  member: PipelineItemMember | null;
};

export type PipelineDetail = Pipeline & {
  stages: PipelineStage[];
  items: PipelineItemRow[];
};

export async function getPipeline(
  s: Scope,
  id: string
): Promise<PipelineDetail | null> {
  const d = db(s.region);
  const pipeline = await d
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.id, id), eq(pipelines.workspaceId, s.workspaceId)))
    .get();
  if (!pipeline) return null;

  const [stages, itemRows] = await Promise.all([
    d
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.pipelineId, id))
      .orderBy(asc(pipelineStages.position), asc(pipelineStages.createdAt)),
    d
      .select()
      .from(pipelineItems)
      .where(eq(pipelineItems.pipelineId, id))
      .orderBy(desc(pipelineItems.updatedAt))
  ]);

  const personIds = itemRows.filter((i) => i.kind === 'person').map((i) => i.refId);
  const companyIds = itemRows.filter((i) => i.kind === 'company').map((i) => i.refId);

  const [peopleRows, companyRows] = await Promise.all([
    personIds.length > 0
      ? d
          .select({
            id: people.id,
            name: people.name,
            role: people.role,
            avatarUrl: people.avatarUrl
          })
          .from(people)
          .where(and(eq(people.workspaceId, s.workspaceId), inArray(people.id, personIds)))
      : Promise.resolve([] as { id: string; name: string; role: string | null; avatarUrl: string | null }[]),
    companyIds.length > 0
      ? d
          .select({
            id: companies.id,
            name: companies.name,
            logoUrl: companies.logoUrl,
            faviconUrl: companies.faviconUrl,
            domain: companies.domain
          })
          .from(companies)
          .where(and(eq(companies.workspaceId, s.workspaceId), inArray(companies.id, companyIds)))
      : Promise.resolve([] as { id: string; name: string; logoUrl: string | null; faviconUrl: string | null; domain: string | null }[])
  ]);

  const peopleMap = new Map(peopleRows.map((p) => [p.id, p]));
  const companyMap = new Map(companyRows.map((c) => [c.id, c]));

  const items: PipelineItemRow[] = itemRows.map((i) => {
    let member: PipelineItemMember | null = null;
    if (i.kind === 'person') {
      const p = peopleMap.get(i.refId);
      if (p) member = { id: p.id, name: p.name, role: p.role, avatarUrl: p.avatarUrl };
    } else if (i.kind === 'company') {
      const c = companyMap.get(i.refId);
      if (c)
        member = {
          id: c.id,
          name: c.name,
          logoUrl: c.logoUrl,
          faviconUrl: c.faviconUrl,
          domain: c.domain
        };
    }
    return {
      id: i.id,
      kind: i.kind as MemberKind,
      refId: i.refId,
      stageId: i.stageId,
      enteredStageAt: i.enteredStageAt,
      note: i.note,
      valueCents: i.valueCents,
      currency: i.currency,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      member
    };
  });

  return { ...pipeline, stages, items };
}

export type ManualPipelineInput = {
  name: string;
  description?: string | null;
  defaultView?: PipelineView;
  /** When omitted, a sensible default set of stages is created. */
  initialStages?: { name: string; color?: string | null }[];
};

const DEFAULT_STAGES: { name: string; color: string }[] = [
  { name: 'Backlog',              color: 'gray' },
  { name: 'In progress',          color: 'sky' },
  { name: 'Waiting for response', color: 'yellow' },
  { name: 'Won',                  color: 'green' },
  { name: 'Lost',                 color: 'red' },
];

export async function createPipeline(
  s: Scope,
  input: ManualPipelineInput
): Promise<{ id: string }> {
  const d = db(s.region);
  const name = sanitizePlainText(input.name, 200);
  if (!name) throw new Error('missing_name');
  const description = input.description ? sanitizePlainText(input.description, 1000) : null;
  const defaultView: PipelineView = input.defaultView && isPipelineView(input.defaultView) ? input.defaultView : 'kanban';
  const id = createId();
  const now = Date.now();
  await d.insert(pipelines).values({
    id,
    workspaceId: s.workspaceId,
    userId: s.userId,
    name,
    description: description || null,
    defaultView,
    isArchived: 0,
    createdAt: now,
    updatedAt: now
  });

  const stages = (input.initialStages && input.initialStages.length > 0
    ? input.initialStages
    : DEFAULT_STAGES
  ).map((s, idx) => ({
    id: createId(),
    pipelineId: id,
    name: sanitizePlainText(s.name, 100) || s.name,
    kind: colorToKind(s.color),
    color: s.color ?? null,
    position: idx,
    createdAt: now
  }));
  if (stages.length > 0) {
    await d.insert(pipelineStages).values(stages);
  }
  return { id };
}

export type UpdatePipelineInput = {
  name?: string;
  description?: string | null;
  defaultView?: PipelineView;
  isArchived?: boolean | 0 | 1;
};

export async function updatePipeline(
  s: Scope,
  id: string,
  input: UpdatePipelineInput
): Promise<void> {
  const d = db(s.region);
  const updates: Partial<typeof pipelines.$inferInsert> = { updatedAt: Date.now() };
  if (input.name != null) {
    const next = sanitizePlainText(input.name, 200);
    if (!next) throw new Error('missing_name');
    updates.name = next;
  }
  if (input.description !== undefined) {
    updates.description = input.description
      ? sanitizePlainText(input.description, 1000) || null
      : null;
  }
  if (input.defaultView !== undefined) {
    if (!isPipelineView(input.defaultView)) throw new Error('invalid_view');
    updates.defaultView = input.defaultView;
  }
  if (input.isArchived !== undefined) {
    updates.isArchived = input.isArchived ? 1 : 0;
  }
  await d
    .update(pipelines)
    .set(updates)
    .where(and(eq(pipelines.id, id), eq(pipelines.workspaceId, s.workspaceId)));
}

export async function deletePipeline(
  s: Scope,
  id: string
): Promise<void> {
  const d = db(s.region);
  await d
    .delete(pipelines)
    .where(and(eq(pipelines.id, id), eq(pipelines.workspaceId, s.workspaceId)));
}

// ──────────────────────────────────────────────────────────────────────────────
// Stages

async function ensurePipelineOwned(
  d: ReturnType<typeof db>,
  workspaceId: string,
  pipelineId: string
): Promise<boolean> {
  const r = await d
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(and(eq(pipelines.id, pipelineId), eq(pipelines.workspaceId, workspaceId)))
    .get();
  return !!r;
}

async function ensureStageInPipeline(
  d: ReturnType<typeof db>,
  pipelineId: string,
  stageId: string
): Promise<PipelineStage | null> {
  const r = await d
    .select()
    .from(pipelineStages)
    .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.pipelineId, pipelineId)))
    .get();
  return r ?? null;
}

export async function addStage(
  s: Scope,
  pipelineId: string,
  input: { name: string; color?: string | null; position?: number }
): Promise<{ id: string }> {
  const d = db(s.region);
  if (!(await ensurePipelineOwned(d, s.workspaceId, pipelineId))) throw new Error('not_found');
  const name = sanitizePlainText(input.name, 100);
  if (!name) throw new Error('missing_name');

  // Default position = end of the list.
  let position = input.position;
  if (position === undefined) {
    const last = await d
      .select({ maxPos: sql<number>`MAX(${pipelineStages.position})` })
      .from(pipelineStages)
      .where(eq(pipelineStages.pipelineId, pipelineId))
      .get();
    position = (Number(last?.maxPos ?? -1) + 1) | 0;
  }
  const id = createId();
  await d.insert(pipelineStages).values({
    id,
    pipelineId,
    name,
    kind: colorToKind(input.color),
    color: input.color ?? null,
    position,
    createdAt: Date.now()
  });
  await d
    .update(pipelines)
    .set({ updatedAt: Date.now() })
    .where(eq(pipelines.id, pipelineId));
  return { id };
}

export async function updateStage(
  s: Scope,
  pipelineId: string,
  stageId: string,
  input: { name?: string; color?: string | null }
): Promise<void> {
  const d = db(s.region);
  if (!(await ensurePipelineOwned(d, s.workspaceId, pipelineId))) throw new Error('not_found');
  if (!(await ensureStageInPipeline(d, pipelineId, stageId))) throw new Error('not_found');
  const updates: Partial<typeof pipelineStages.$inferInsert> = {};
  if (input.name != null) {
    const next = sanitizePlainText(input.name, 100);
    if (!next) throw new Error('missing_name');
    updates.name = next;
  }
  if ('color' in input) {
    updates.color = input.color ?? null;
    updates.kind = colorToKind(input.color);
  }
  if (Object.keys(updates).length === 0) return;
  await d
    .update(pipelineStages)
    .set(updates)
    .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.pipelineId, pipelineId)));
  await d
    .update(pipelines)
    .set({ updatedAt: Date.now() })
    .where(eq(pipelines.id, pipelineId));
}

export async function reorderStages(
  s: Scope,
  pipelineId: string,
  orderedStageIds: string[]
): Promise<void> {
  const d = db(s.region);
  if (!(await ensurePipelineOwned(d, s.workspaceId, pipelineId))) throw new Error('not_found');
  const existing = await d
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, pipelineId));
  const validIds = new Set(existing.map((s) => s.id));
  for (let i = 0; i < orderedStageIds.length; i++) {
    const stageId = orderedStageIds[i];
    if (!validIds.has(stageId)) continue;
    await d
      .update(pipelineStages)
      .set({ position: i })
      .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.pipelineId, pipelineId)));
  }
  await d
    .update(pipelines)
    .set({ updatedAt: Date.now() })
    .where(eq(pipelines.id, pipelineId));
}

export async function deleteStage(
  s: Scope,
  pipelineId: string,
  stageId: string,
  moveToStageId?: string | null
): Promise<void> {
  const d = db(s.region);
  if (!(await ensurePipelineOwned(d, s.workspaceId, pipelineId))) throw new Error('not_found');
  if (!(await ensureStageInPipeline(d, pipelineId, stageId))) throw new Error('not_found');

  const items = await d
    .select({ id: pipelineItems.id, stageId: pipelineItems.stageId })
    .from(pipelineItems)
    .where(eq(pipelineItems.stageId, stageId));

  if (items.length > 0) {
    if (!moveToStageId) throw new Error('stage_has_items');
    if (moveToStageId === stageId) throw new Error('invalid_move_target');
    const target = await ensureStageInPipeline(d, pipelineId, moveToStageId);
    if (!target) throw new Error('not_found');
    const now = Date.now();
    for (const it of items) {
      await d
        .update(pipelineItems)
        .set({ stageId: moveToStageId, enteredStageAt: now, updatedAt: now })
        .where(eq(pipelineItems.id, it.id));
      await d.insert(pipelineItemEvents).values({
        id: createId(),
        itemId: it.id,
        fromStageId: stageId,
        toStageId: moveToStageId,
        at: now,
        byUserId: s.userId
      });
    }
  }

  await d
    .delete(pipelineStages)
    .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.pipelineId, pipelineId)));
  await d
    .update(pipelines)
    .set({ updatedAt: Date.now() })
    .where(eq(pipelines.id, pipelineId));
}

// ──────────────────────────────────────────────────────────────────────────────
// Items

async function ensureMember(
  d: ReturnType<typeof db>,
  workspaceId: string,
  kind: MemberKind,
  refId: string
): Promise<boolean> {
  if (kind === 'person') {
    const r = await d
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.id, refId), eq(people.workspaceId, workspaceId)))
      .get();
    return !!r;
  }
  const r = await d
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, refId), eq(companies.workspaceId, workspaceId)))
    .get();
  return !!r;
}

export async function addItemToPipeline(
  s: Scope,
  pipelineId: string,
  input: { kind: MemberKind; refId: string; stageId?: string | null }
): Promise<{ id: string; alreadyExisted: boolean }> {
  const d = db(s.region);
  if (!(await ensurePipelineOwned(d, s.workspaceId, pipelineId))) throw new Error('not_found');
  if (!isMemberKind(input.kind)) throw new Error('invalid_kind');
  if (!(await ensureMember(d, s.workspaceId, input.kind, input.refId))) throw new Error('not_found');

  const existing = await d
    .select({ id: pipelineItems.id })
    .from(pipelineItems)
    .where(
      and(
        eq(pipelineItems.pipelineId, pipelineId),
        eq(pipelineItems.kind, input.kind),
        eq(pipelineItems.refId, input.refId)
      )
    )
    .get();
  if (existing) return { id: existing.id, alreadyExisted: true };

  let stageId = input.stageId ?? null;
  if (!stageId) {
    const firstOpen = await d
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(and(eq(pipelineStages.pipelineId, pipelineId), eq(pipelineStages.kind, 'open')))
      .orderBy(asc(pipelineStages.position))
      .limit(1)
      .get();
    if (firstOpen) {
      stageId = firstOpen.id;
    } else {
      const firstAny = await d
        .select({ id: pipelineStages.id })
        .from(pipelineStages)
        .where(eq(pipelineStages.pipelineId, pipelineId))
        .orderBy(asc(pipelineStages.position))
        .limit(1)
        .get();
      if (!firstAny) throw new Error('no_stages');
      stageId = firstAny.id;
    }
  } else {
    const target = await ensureStageInPipeline(d, pipelineId, stageId);
    if (!target) throw new Error('not_found');
  }

  const id = createId();
  const now = Date.now();
  await d.insert(pipelineItems).values({
    id,
    pipelineId,
    kind: input.kind,
    refId: input.refId,
    stageId,
    enteredStageAt: now,
    createdAt: now,
    updatedAt: now
  });
  await d.insert(pipelineItemEvents).values({
    id: createId(),
    itemId: id,
    fromStageId: null,
    toStageId: stageId,
    at: now,
    byUserId: s.userId
  });
  await d
    .update(pipelines)
    .set({ updatedAt: now })
    .where(eq(pipelines.id, pipelineId));
  return { id, alreadyExisted: false };
}

export async function moveItemToStage(
  s: Scope,
  pipelineId: string,
  itemId: string,
  toStageId: string
): Promise<void> {
  const d = db(s.region);
  if (!(await ensurePipelineOwned(d, s.workspaceId, pipelineId))) throw new Error('not_found');
  const item = await d
    .select()
    .from(pipelineItems)
    .where(and(eq(pipelineItems.id, itemId), eq(pipelineItems.pipelineId, pipelineId)))
    .get();
  if (!item) throw new Error('not_found');
  if (item.stageId === toStageId) return;
  const target = await ensureStageInPipeline(d, pipelineId, toStageId);
  if (!target) throw new Error('not_found');

  const now = Date.now();
  await d
    .update(pipelineItems)
    .set({ stageId: toStageId, enteredStageAt: now, updatedAt: now })
    .where(eq(pipelineItems.id, itemId));
  await d.insert(pipelineItemEvents).values({
    id: createId(),
    itemId,
    fromStageId: item.stageId,
    toStageId,
    at: now,
    byUserId: s.userId
  });
  await d
    .update(pipelines)
    .set({ updatedAt: now })
    .where(eq(pipelines.id, pipelineId));
}

export type UpdatePipelineItemInput = {
  note?: string | null;
  valueCents?: number | null;
  currency?: string | null;
};

export async function updatePipelineItem(
  s: Scope,
  pipelineId: string,
  itemId: string,
  input: UpdatePipelineItemInput
): Promise<void> {
  const d = db(s.region);
  if (!(await ensurePipelineOwned(d, s.workspaceId, pipelineId))) throw new Error('not_found');
  const item = await d
    .select({ id: pipelineItems.id })
    .from(pipelineItems)
    .where(and(eq(pipelineItems.id, itemId), eq(pipelineItems.pipelineId, pipelineId)))
    .get();
  if (!item) throw new Error('not_found');

  const updates: Partial<typeof pipelineItems.$inferInsert> = { updatedAt: Date.now() };
  if (input.note !== undefined) {
    updates.note = input.note ? sanitizePlainText(input.note, 1000) || null : null;
  }
  if (input.valueCents !== undefined) {
    if (input.valueCents !== null && (!Number.isFinite(input.valueCents) || input.valueCents < 0)) {
      throw new Error('invalid_value');
    }
    updates.valueCents = input.valueCents;
  }
  if (input.currency !== undefined) {
    updates.currency = input.currency
      ? sanitizePlainText(input.currency, 3).toUpperCase() || null
      : null;
  }
  await d
    .update(pipelineItems)
    .set(updates)
    .where(eq(pipelineItems.id, itemId));
  await d
    .update(pipelines)
    .set({ updatedAt: Date.now() })
    .where(eq(pipelines.id, pipelineId));
}

export async function getPipelineItemRef(
  s: Scope,
  pipelineId: string,
  itemId: string
): Promise<{ kind: MemberKind; refId: string } | null> {
  const d = db(s.region);
  if (!(await ensurePipelineOwned(d, s.workspaceId, pipelineId))) return null;
  const row = await d
    .select({ kind: pipelineItems.kind, refId: pipelineItems.refId })
    .from(pipelineItems)
    .where(and(eq(pipelineItems.id, itemId), eq(pipelineItems.pipelineId, pipelineId)))
    .get();
  return row ? { kind: row.kind as MemberKind, refId: row.refId } : null;
}

export async function removePipelineItemByRef(
  s: Scope,
  pipelineId: string,
  kind: MemberKind,
  refId: string
): Promise<void> {
  const d = db(s.region);
  if (!(await ensurePipelineOwned(d, s.workspaceId, pipelineId))) return;
  await d
    .delete(pipelineItems)
    .where(
      and(
        eq(pipelineItems.pipelineId, pipelineId),
        eq(pipelineItems.kind, kind),
        eq(pipelineItems.refId, refId)
      )
    );
  await d.update(pipelines).set({ updatedAt: Date.now() }).where(eq(pipelines.id, pipelineId));
}

export async function removePipelineItem(
  s: Scope,
  pipelineId: string,
  itemId: string
): Promise<void> {
  const d = db(s.region);
  if (!(await ensurePipelineOwned(d, s.workspaceId, pipelineId))) throw new Error('not_found');
  await d
    .delete(pipelineItems)
    .where(and(eq(pipelineItems.id, itemId), eq(pipelineItems.pipelineId, pipelineId)));
  await d
    .update(pipelines)
    .set({ updatedAt: Date.now() })
    .where(eq(pipelines.id, pipelineId));
}

// ──────────────────────────────────────────────────────────────────────────────
// Reverse lookups + search

export type PipelineMembershipForEntity = {
  pipelineId: string;
  pipelineName: string;
  itemId: string;
  stageId: string;
  stageName: string;
  stageKind: StageKind;
  enteredStageAt: number;
  isArchived: number;
};

export async function listPipelinesForEntity(
  s: Scope,
  kind: MemberKind,
  refId: string
): Promise<PipelineMembershipForEntity[]> {
  const d = db(s.region);
  const rows = await d
    .select({
      pipelineId: pipelines.id,
      pipelineName: pipelines.name,
      itemId: pipelineItems.id,
      stageId: pipelineItems.stageId,
      stageName: pipelineStages.name,
      stageKind: pipelineStages.kind,
      enteredStageAt: pipelineItems.enteredStageAt,
      isArchived: pipelines.isArchived
    })
    .from(pipelineItems)
    .innerJoin(pipelines, eq(pipelines.id, pipelineItems.pipelineId))
    .innerJoin(pipelineStages, eq(pipelineStages.id, pipelineItems.stageId))
    .where(
      and(
        eq(pipelines.workspaceId, s.workspaceId),
        eq(pipelineItems.kind, kind),
        eq(pipelineItems.refId, refId)
      )
    )
    .orderBy(asc(pipelines.name));
  return rows.map((r) => ({
    ...r,
    stageKind: r.stageKind as StageKind,
    isArchived: Number(r.isArchived ?? 0)
  }));
}

export async function searchPipelines(
  s: Scope,
  q: string,
  limit = 8
): Promise<{ id: string; name: string; isArchived: number }[]> {
  const d = db(s.region);
  const fts = ftsQuery(q);
  if (!fts) {
    const rows = await d
      .select({ id: pipelines.id, name: pipelines.name, isArchived: pipelines.isArchived })
      .from(pipelines)
      .where(eq(pipelines.workspaceId, s.workspaceId))
      .orderBy(desc(pipelines.updatedAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, isArchived: Number(r.isArchived ?? 0) }));
  }
  const rows = await d.all<{ id: string; name: string; isArchived: number }>(sql`
    SELECT p.id, p.name, p.is_archived AS isArchived
    FROM pipelines p
    JOIN pipelines_fts f ON f.rowid = p.rowid
    WHERE p.workspace_id = ${s.workspaceId} AND f.pipelines_fts MATCH ${fts}
    ORDER BY rank
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ ...r, isArchived: Number(r.isArchived ?? 0) }));
}

export async function seedPipelineFromCollection(
  s: Scope,
  pipelineId: string,
  collectionId: string
): Promise<{ added: number }> {
  const d = db(s.region);

  const coll = await d
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.workspaceId, s.workspaceId)))
    .get();
  if (!coll) return { added: 0 };

  const firstStage =
    (await d
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(and(eq(pipelineStages.pipelineId, pipelineId), eq(pipelineStages.kind, 'open')))
      .orderBy(asc(pipelineStages.position))
      .limit(1)
      .get()) ??
    (await d
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(eq(pipelineStages.pipelineId, pipelineId))
      .orderBy(asc(pipelineStages.position))
      .limit(1)
      .get());
  if (!firstStage) return { added: 0 };

  const rawMembers = await d
    .select({ kind: collectionItems.kind, refId: collectionItems.refId })
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, collectionId));

  if (rawMembers.length === 0) return { added: 0 };

  const personIds = rawMembers.filter((m) => m.kind === 'person').map((m) => m.refId);
  const companyIds = rawMembers.filter((m) => m.kind === 'company').map((m) => m.refId);

  const [existingPeople, existingCompanies] = await Promise.all([
    personIds.length > 0
      ? d.select({ id: people.id }).from(people).where(and(eq(people.workspaceId, s.workspaceId), inArray(people.id, personIds)))
      : Promise.resolve([]),
    companyIds.length > 0
      ? d.select({ id: companies.id }).from(companies).where(and(eq(companies.workspaceId, s.workspaceId), inArray(companies.id, companyIds)))
      : Promise.resolve([])
  ]);

  const validPersonIds = new Set(existingPeople.map((p) => p.id));
  const validCompanyIds = new Set(existingCompanies.map((c) => c.id));

  const members = rawMembers.filter((m) =>
    (m.kind === 'person' && validPersonIds.has(m.refId)) ||
    (m.kind === 'company' && validCompanyIds.has(m.refId))
  );

  if (members.length === 0) return { added: 0 };

  const now = Date.now();
  for (const m of members) {
    if (m.kind !== 'person' && m.kind !== 'company') continue;
    const id = createId();
    await d.insert(pipelineItems).values({
      id,
      pipelineId,
      kind: m.kind,
      refId: m.refId,
      stageId: firstStage.id,
      enteredStageAt: now,
      createdAt: now,
      updatedAt: now
    });
    await d.insert(pipelineItemEvents).values({
      id: createId(),
      itemId: id,
      fromStageId: null,
      toStageId: firstStage.id,
      at: now,
      byUserId: s.userId
    });
  }

  await d.update(pipelines).set({ updatedAt: now }).where(eq(pipelines.id, pipelineId));
  return { added: members.length };
}
