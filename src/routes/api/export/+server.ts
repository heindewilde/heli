import { requireScope } from '$lib/server/scope';
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
import {
  collectionExportTable,
  companiesExportTable,
  parseCollectionMembers,
  parseExportBody,
  peopleExportTable,
  type CsvTable
} from '$lib/server/export';
import { getTagsForEntities } from '$lib/server/tags';
import { listTimeEntries } from '$lib/server/time';

const KINDS = ['people', 'companies', 'interactions', 'projects', 'time', 'collection'] as const;
type Kind = (typeof KINDS)[number];

function isKind(v: string | null): v is Kind {
  return v != null && (KINDS as readonly string[]).includes(v);
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const s = requireScope(locals);
  // No role gate, deliberately. It used to be owner/admin as "friction, not
  // containment" — but a member can already read substantially the same data
  // through /api/people, /api/companies and /api/search, so it only ever bought
  // friction. Export now has buttons on /people, /companies and every
  // collection, where a gate does not read as friction: it renders as a 403
  // error page on a button the page just offered you. (It also un-breaks the
  // CSV link the /time report has always shown to members.)
  const kind = url.searchParams.get('kind');
  if (!isKind(kind)) throw error(400, 'invalid_kind');

  const d = db(s.region);

  let stream: ReadableStream<Uint8Array>;
  let filename = `heli-${kind}-${today()}.csv`;

  if (kind === 'people') {
    stream = tableToStream(await peopleExportTable(s, { by: 'filters', params: url.searchParams }));
  } else if (kind === 'companies') {
    stream = tableToStream(await companiesExportTable(s, { by: 'filters', params: url.searchParams }));
  } else if (kind === 'collection') {
    const id = url.searchParams.get('id');
    if (!id) throw error(400, 'missing_id');
    // `members`, not `kind`: `kind` is already the export dispatch, and the
    // collection page's own filter would collide with it.
    const members = parseCollectionMembers(url.searchParams.get('members'));
    const { table, name } = await collectionExportTable(s, id, members);
    stream = tableToStream(table);
    filename = `heli-collection-${slug(name)}-${today()}.csv`;
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
  } else if (kind === 'time') {
    // Tracked time. This is the invoicing seam — Heli generates no invoices, so
    // the CSV is how hours reach whatever does. Running entries are excluded:
    // an hour that has not finished is not a line on a bill.
    //
    // `hourly_rate_cents` is the snapshot stored on the row, not the project's
    // current rate, so re-exporting an old month cannot silently reprice it.
    // Honour the report's own filters. An export button under a filtered
    // report that quietly exported the whole workspace would be worse than no
    // button at all.
    const num = (k: string) => {
      const v = Number(url.searchParams.get(k));
      return url.searchParams.has(k) && Number.isFinite(v) ? v : undefined;
    };
    const userParam = url.searchParams.get('user');
    const billableParam = url.searchParams.get('billable');
    const rows = await listTimeEntries(s, {
      userId: userParam === 'me' ? s.userId : (userParam ?? 'all'),
      projectId: url.searchParams.get('project') ?? undefined,
      from: num('from'),
      to: num('to'),
      billable: billableParam ? billableParam === '1' : undefined,
      limit: 500
    });
    stream = csvStream({
      header: [
        'id',
        'user',
        'project',
        'milestone',
        'description',
        'started_at',
        'ended_at',
        'minutes',
        'billable',
        'hourly_rate_cents',
        'currency',
        'amount_cents'
      ],
      rows: rows.filter((r) => r.endedAt != null),
      toRow: (t) => {
        const minutes = Math.round(((t.endedAt as number) - t.startedAt) / 60_000);
        const amount = t.billable && t.hourlyRate != null
          ? Math.round((t.hourlyRate * minutes) / 60)
          : '';
        return [
          t.id,
          t.userName,
          t.projectName ?? '',
          t.milestoneTitle ?? '',
          t.description ?? '',
          new Date(t.startedAt).toISOString(),
          new Date(t.endedAt as number).toISOString(),
          minutes,
          t.billable ? '1' : '0',
          t.hourlyRate ?? '',
          t.currency ?? '',
          amount
        ];
      }
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
        'project_type',
        'start_date',
        'end_date',
        'billing_type',
        'hourly_rate_cents',
        'fixed_fee_cents',
        'monthly_fee_cents',
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
        p.projectType ?? '',
        isoDate(p.startDate),
        isoDate(p.endDate),
        p.billingType,
        p.hourlyRate ?? '',
        p.fixedFee ?? '',
        p.monthlyFee ?? '',
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

  return csvResponse(stream, filename);
};

/**
 * The selection export. A POST because a tick-box selection can run to hundreds
 * of rows and an id list that long does not fit in a URL — this is a read, and
 * `MEMBER_ALLOWED` in check-tenancy.ts records that.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireScope(locals);
  const { kind, ids } = parseExportBody(await request.json().catch(() => null));
  const table =
    kind === 'people'
      ? await peopleExportTable(s, { by: 'ids', ids })
      : await companiesExportTable(s, { by: 'ids', ids });
  return csvResponse(tableToStream(table), `heli-${kind}-${today()}.csv`);
};

function tableToStream(table: CsvTable): ReadableStream<Uint8Array> {
  return csvStream({ header: table.header, rows: table.rows, toRow: (r) => r });
}

function csvResponse(stream: ReadableStream<Uint8Array>, filename: string): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store'
    }
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Keeps a collection's name in the filename without letting it out of ASCII —
 *  a quoted `filename=` carrying a comma or a quote is a broken header. */
function slug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, 40) || 'untitled';
}
