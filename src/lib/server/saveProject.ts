import { and, eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import {
  projects,
  projectLinks,
  projectPeople,
  projectCompanies,
  interactionProjects,
  PROJECT_STATUSES,
  BILLING_TYPES,
  type ProjectStatus,
  type BillingType
} from './schema';
import { sanitize, sanitizePlainText } from './sanitize';
import type { Scope } from './scope';
import { bumpSearchEpoch } from './search';

export type ManualProjectInput = {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  // Dates accept ISO strings (`'2026-05-01'`) or epoch ms — the form path
  // submits strings, the API path can pass either. Coercion happens in
  // sanitizeDate.
  startDate?: number | string | null;
  endDate?: number | string | null;
  billingType?: BillingType;
  hourlyRate?: number | null;
  fixedFee?: number | null;
  currency?: string | null;
  nextStep?: string | null;
  icon?: string | null;
};

export type UpdateProjectInput = Partial<ManualProjectInput>;

export function isProjectStatus(v: unknown): v is ProjectStatus {
  return typeof v === 'string' && (PROJECT_STATUSES as readonly string[]).includes(v);
}

export function isBillingType(v: unknown): v is BillingType {
  return typeof v === 'string' && (BILLING_TYPES as readonly string[]).includes(v);
}

const ALLOWED_CURRENCY = /^[A-Z]{3}$/;

function sanitizeCurrency(v: unknown): string | null {
  if (v == null) return null;
  const up = String(v).trim().toUpperCase();
  if (!up) return null;
  if (!ALLOWED_CURRENCY.test(up)) throw new Error('invalid_currency');
  return up;
}

function sanitizeMoneyCents(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid_money');
  // Round to whole cents — UI may pass decimal cents from string parsing.
  return Math.round(n);
}

function sanitizeDate(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const ts = new Date(v).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  throw new Error('invalid_date');
}

/**
 * Coerce a manual input shape into the row we'll insert/update. Throws on
 * structurally invalid values so the API can return 400 with a usable code.
 */
function coerceFields(input: UpdateProjectInput): Partial<typeof projects.$inferInsert> {
  const out: Partial<typeof projects.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = sanitizePlainText(String(input.name ?? ''), 200);
    if (!name) throw new Error('missing_name');
    out.name = name;
  }
  if (input.description !== undefined) {
    out.description = input.description == null ? null : sanitize(String(input.description));
  }
  if (input.status !== undefined) {
    if (!isProjectStatus(input.status)) throw new Error('invalid_status');
    out.status = input.status;
  }
  if (input.startDate !== undefined) out.startDate = sanitizeDate(input.startDate);
  if (input.endDate !== undefined) out.endDate = sanitizeDate(input.endDate);
  if (input.billingType !== undefined) {
    if (!isBillingType(input.billingType)) throw new Error('invalid_billing_type');
    out.billingType = input.billingType;
  }
  if (input.hourlyRate !== undefined) out.hourlyRate = sanitizeMoneyCents(input.hourlyRate);
  if (input.fixedFee !== undefined) out.fixedFee = sanitizeMoneyCents(input.fixedFee);
  if (input.currency !== undefined) out.currency = sanitizeCurrency(input.currency);
  if (input.nextStep !== undefined) {
    out.nextStep = input.nextStep == null ? null : sanitizePlainText(String(input.nextStep), 200) || null;
  }
  if (input.icon !== undefined) {
    out.icon = input.icon == null ? null : sanitizePlainText(String(input.icon), 50) || null;
  }
  return out;
}

export async function createProject(
  s: Scope,
  input: ManualProjectInput
): Promise<{ id: string }> {
  const fields = coerceFields(input);
  if (!fields.name) throw new Error('missing_name');
  // Cross-field consistency: clear money fields when not relevant.
  const billingType = (fields.billingType as BillingType | undefined) ?? 'none';
  if (billingType === 'none') {
    fields.hourlyRate = null;
    fields.fixedFee = null;
    fields.currency = null;
  } else if (billingType === 'hourly') {
    fields.fixedFee = null;
  } else if (billingType === 'fixed') {
    fields.hourlyRate = null;
  }
  const id = createId();
  const now = Date.now();
  await db(s.region).insert(projects).values({
    id,
    workspaceId: s.workspaceId,
    userId: s.userId,
    name: fields.name,
    description: fields.description ?? null,
    status: (fields.status as ProjectStatus | undefined) ?? 'active',
    startDate: fields.startDate ?? null,
    endDate: fields.endDate ?? null,
    billingType,
    hourlyRate: fields.hourlyRate ?? null,
    fixedFee: fields.fixedFee ?? null,
    currency: fields.currency ?? null,
    nextStep: fields.nextStep ?? null,
    icon: fields.icon ?? null,
    createdAt: now,
    updatedAt: now
  });
  bumpSearchEpoch(s.workspaceId);
  return { id };
}

export async function updateProject(
  s: Scope,
  id: string,
  input: UpdateProjectInput
): Promise<void> {
  const fields = coerceFields(input);
  if (Object.keys(fields).length === 0) throw new Error('no_updates');
  // Same cross-field rules as create: when billingType changes, blank out
  // the irrelevant money fields so we never end up with a stale rate.
  if ('billingType' in fields) {
    if (fields.billingType === 'none') {
      fields.hourlyRate = null;
      fields.fixedFee = null;
      fields.currency = null;
    } else if (fields.billingType === 'hourly') {
      fields.fixedFee = null;
    } else if (fields.billingType === 'fixed') {
      fields.hourlyRate = null;
    }
  }
  await db(s.region)
    .update(projects)
    .set({ ...fields, updatedAt: Date.now() })
    .where(and(eq(projects.id, id), eq(projects.workspaceId, s.workspaceId)));
  bumpSearchEpoch(s.workspaceId);
}

export async function deleteProject(
  s: Scope,
  id: string
): Promise<void> {
  // Cascades: project_links, project_people, project_companies,
  // interaction_projects, project_tags all FK with ON DELETE CASCADE.
  await db(s.region).delete(projects).where(and(eq(projects.id, id), eq(projects.workspaceId, s.workspaceId)));
  bumpSearchEpoch(s.workspaceId);
}

// ----- Member sub-resources ------------------------------------------------

export async function attachPerson(
  s: Scope,
  projectId: string,
  personId: string
): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  await db(s.region)
    .insert(projectPeople)
    .values({ projectId, personId })
    .onConflictDoNothing();
}

export async function detachPerson(
  s: Scope,
  projectId: string,
  personId: string
): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  await db(s.region)
    .delete(projectPeople)
    .where(and(eq(projectPeople.projectId, projectId), eq(projectPeople.personId, personId)));
}

export async function attachCompany(
  s: Scope,
  projectId: string,
  companyId: string
): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  await db(s.region)
    .insert(projectCompanies)
    .values({ projectId, companyId })
    .onConflictDoNothing();
}

export async function detachCompany(
  s: Scope,
  projectId: string,
  companyId: string
): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  await db(s.region)
    .delete(projectCompanies)
    .where(and(eq(projectCompanies.projectId, projectId), eq(projectCompanies.companyId, companyId)));
}

export async function attachInteraction(
  s: Scope,
  projectId: string,
  interactionId: string
): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  await db(s.region)
    .insert(interactionProjects)
    .values({ projectId, interactionId })
    .onConflictDoNothing();
}

export async function detachInteraction(
  s: Scope,
  projectId: string,
  interactionId: string
): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  await db(s.region)
    .delete(interactionProjects)
    .where(
      and(
        eq(interactionProjects.projectId, projectId),
        eq(interactionProjects.interactionId, interactionId)
      )
    );
}

// ----- Links ---------------------------------------------------------------

const LINK_URL_MAX = 2048;
const LINK_LABEL_MAX = 80;

function sanitizeLinkUrl(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) throw new Error('missing_url');
  if (!/^https?:\/\//i.test(s)) throw new Error('bad_scheme');
  if (s.length > LINK_URL_MAX) throw new Error('url_too_long');
  return s;
}

export async function addLink(
  s: Scope,
  projectId: string,
  rawUrl: unknown,
  rawLabel: unknown
): Promise<{ id: string }> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  const url = sanitizeLinkUrl(rawUrl);
  const label = rawLabel == null ? null : sanitizePlainText(String(rawLabel), LINK_LABEL_MAX) || null;
  const id = createId();
  await db(s.region).insert(projectLinks).values({
    id,
    projectId,
    url,
    label,
    createdAt: Date.now()
  });
  return { id };
}

export async function updateLink(
  s: Scope,
  projectId: string,
  linkId: string,
  rawUrl: unknown,
  rawLabel: unknown
): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  const updates: Partial<typeof projectLinks.$inferInsert> = {};
  if (rawUrl !== undefined) updates.url = sanitizeLinkUrl(rawUrl);
  if (rawLabel !== undefined) {
    updates.label = rawLabel == null ? null : sanitizePlainText(String(rawLabel), LINK_LABEL_MAX) || null;
  }
  if (Object.keys(updates).length === 0) throw new Error('no_updates');
  await db(s.region)
    .update(projectLinks)
    .set(updates)
    .where(and(eq(projectLinks.id, linkId), eq(projectLinks.projectId, projectId)));
}

export async function removeLink(
  s: Scope,
  projectId: string,
  linkId: string
): Promise<void> {
  if (!(await projectExists(s, projectId))) throw new Error('not_found');
  await db(s.region)
    .delete(projectLinks)
    .where(and(eq(projectLinks.id, linkId), eq(projectLinks.projectId, projectId)));
}

// ----- Helpers -------------------------------------------------------------

async function projectExists(s: Scope, projectId: string): Promise<boolean> {
  const row = await db(s.region)
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, s.workspaceId)))
    .get();
  return !!row;
}
