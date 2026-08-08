import { requireScope, requireRole } from '$lib/server/scope';
import { error, type RequestHandler } from '@sveltejs/kit';
import { eq, asc, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
  people,
  companies,
  interactions,
  interactionPeople,
  projects,
  projectLinks,
  projectPeople,
  projectCompanies
} from '$lib/server/schema';
import { csvStream, isoDate } from '$lib/server/csv';
import { getTagsForEntities } from '$lib/server/tags';

const KINDS = ['people', 'companies', 'interactions', 'projects'] as const;
type Kind = (typeof KINDS)[number];

function isKind(v: string | null): v is Kind {
  return v != null && (KINDS as readonly string[]).includes(v);
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireScope(locals);
  // Export now covers the whole workspace, not just your own rows.
  //
  // Friction, not containment: a member can read substantially the same data
  // through /api/people, /api/companies and /api/search. This makes bulk
  // extraction a deliberate act rather than a one-click one; don't mistake it
  // for a security boundary.
  requireRole(s, 'owner', 'admin');
  const kind = url.searchParams.get('kind');
  if (!isKind(kind)) throw error(400, 'invalid_kind');

  const d = db(s.region);

  let stream: ReadableStream<Uint8Array>;

  if (kind === 'people') {
    const rows = await d
      .select()
      .from(people)
      .where(eq(people.workspaceId, s.workspaceId));
    const tagMap = await getTagsForEntities(s, 'person', rows.map((r) => r.id));
    stream = csvStream({
      header: [
        'id',
        'name',
        'url',
        'domain',
        'handle',
        'role',
        'company_id',
        'email',
        'phone',
        'location',
        'avatar_url',
        'notes',
        'tags',
        'is_favorite',
        'is_archived',
        'created_at',
        'updated_at'
      ],
      rows,
      toRow: (p) => [
        p.id,
        p.name,
        p.url ?? '',
        p.domain ?? '',
        p.handle ?? '',
        p.role ?? '',
        p.companyId ?? '',
        p.email ?? '',
        p.phone ?? '',
        p.location ?? '',
        p.avatarUrl ?? '',
        p.notes ?? '',
        (tagMap.get(p.id) ?? []).map((t) => t.name).join('|'),
        p.isFavorite ? '1' : '0',
        p.isArchived ? '1' : '0',
        isoDate(p.createdAt),
        isoDate(p.updatedAt)
      ]
    });
  } else if (kind === 'companies') {
    const rows = await d
      .select()
      .from(companies)
      .where(eq(companies.workspaceId, s.workspaceId));
    const tagMap = await getTagsForEntities(s, 'company', rows.map((r) => r.id));
    stream = csvStream({
      header: [
        'id',
        'name',
        'url',
        'domain',
        'description',
        'industry',
        'location',
        'logo_url',
        'notes',
        'tags',
        'is_favorite',
        'is_archived',
        'created_at',
        'updated_at'
      ],
      rows,
      toRow: (c) => [
        c.id,
        c.name,
        c.url ?? '',
        c.domain ?? '',
        c.description ?? '',
        c.industry ?? '',
        c.location ?? '',
        c.logoUrl ?? '',
        c.notes ?? '',
        (tagMap.get(c.id) ?? []).map((t) => t.name).join('|'),
        c.isFavorite ? '1' : '0',
        c.isArchived ? '1' : '0',
        isoDate(c.createdAt),
        isoDate(c.updatedAt)
      ]
    });
  } else if (kind === 'interactions') {
    const rows = await d
      .select()
      .from(interactions)
      .where(eq(interactions.workspaceId, s.workspaceId));
    // Person links: one query, group by interactionId.
    const interactionIds = rows.map((r) => r.id);
    const links = interactionIds.length
      ? await d
          .select({
            interactionId: interactionPeople.interactionId,
            personId: interactionPeople.personId
          })
          .from(interactionPeople)
          .where(inArray(interactionPeople.interactionId, interactionIds))
      : [];
    const personByInteraction = new Map<string, string[]>();
    for (const l of links) {
      const list = personByInteraction.get(l.interactionId) ?? [];
      list.push(l.personId);
      personByInteraction.set(l.interactionId, list);
    }
    stream = csvStream({
      header: [
        'id',
        'occurred_at',
        'type',
        'title',
        'body',
        'company_id',
        'person_ids',
        'created_at',
        'updated_at'
      ],
      rows,
      toRow: (i) => [
        i.id,
        isoDate(i.occurredAt),
        i.type,
        i.title,
        i.body ?? '',
        i.companyId ?? '',
        (personByInteraction.get(i.id) ?? []).join('|'),
        isoDate(i.createdAt),
        isoDate(i.updatedAt)
      ]
    });
  } else {
    // projects
    const rows = await d
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, s.workspaceId));
    const ids = rows.map((r) => r.id);
    // Sub-resources fetched in parallel; the empty-id-array case still works
    // because the IN clause naturally returns nothing.
    const [linkRows, peopleLinks, companyLinks] = ids.length
      ? await Promise.all([
          d
            .select({ projectId: projectLinks.projectId, url: projectLinks.url, label: projectLinks.label })
            .from(projectLinks)
            .where(inArray(projectLinks.projectId, ids))
            .orderBy(asc(projectLinks.createdAt)),
          d
            .select({ projectId: projectPeople.projectId, personId: projectPeople.personId })
            .from(projectPeople)
            .where(inArray(projectPeople.projectId, ids)),
          d
            .select({ projectId: projectCompanies.projectId, companyId: projectCompanies.companyId })
            .from(projectCompanies)
            .where(inArray(projectCompanies.projectId, ids))
        ])
      : [[], [], []];

    const linksByProject = new Map<string, string[]>();
    for (const l of linkRows) {
      const list = linksByProject.get(l.projectId) ?? [];
      // url|label pair, label may be empty. Split per-pair on |, pairs joined by ;
      list.push(`${l.url}|${l.label ?? ''}`);
      linksByProject.set(l.projectId, list);
    }
    const peopleByProject = new Map<string, string[]>();
    for (const l of peopleLinks) {
      const list = peopleByProject.get(l.projectId) ?? [];
      list.push(l.personId);
      peopleByProject.set(l.projectId, list);
    }
    const companiesByProject = new Map<string, string[]>();
    for (const l of companyLinks) {
      const list = companiesByProject.get(l.projectId) ?? [];
      list.push(l.companyId);
      companiesByProject.set(l.projectId, list);
    }

    stream = csvStream({
      header: [
        'id',
        'name',
        'description',
        'status',
        'start_date',
        'end_date',
        'billing_type',
        'hourly_rate_cents',
        'fixed_fee_cents',
        'currency',
        'next_step',
        'person_ids',
        'company_ids',
        'links',
        'created_at',
        'updated_at'
      ],
      rows,
      toRow: (p) => [
        p.id,
        p.name,
        p.description ?? '',
        p.status,
        isoDate(p.startDate),
        isoDate(p.endDate),
        p.billingType,
        p.hourlyRate ?? '',
        p.fixedFee ?? '',
        p.currency ?? '',
        p.nextStep ?? '',
        (peopleByProject.get(p.id) ?? []).join('|'),
        (companiesByProject.get(p.id) ?? []).join('|'),
        (linksByProject.get(p.id) ?? []).join(';'),
        isoDate(p.createdAt),
        isoDate(p.updatedAt)
      ]
    });
  }

  const filename = `heli-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store'
    }
  });
};
