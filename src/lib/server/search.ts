/**
 * FTS5 query helpers. SQLite FTS5 has its own MATCH grammar; raw user input
 * can blow up with reserved characters (`"`, `*`, `:`, etc.). We normalize
 * to a prefix-match-per-token query.
 */

import { sql } from 'drizzle-orm';
import { db } from './db';

const FTS_RESERVED = /[\"():*]/g;

export function ftsQuery(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.replace(FTS_RESERVED, '').trim())
    .filter((t) => t.length >= 1)
    .map((t) => `"${t}"*`); // each token: literal-quote + prefix wildcard
  if (tokens.length === 0) return null;
  return tokens.join(' ');
}

export type CommandHit = {
  kind: 'person' | 'company' | 'interaction' | 'project';
  id: string;
  title: string;
  sub: string | null;
  href: string;
};

export type CommandScope = 'person' | 'company' | 'interaction' | 'project';

// `pr:` MUST be checked before `p:` — otherwise "pr:foo" parses as scope=person
// query="r:foo". Order in the regex's alternation matters because the regex
// engine tries left-to-right.
const SCOPE_PREFIX_RE = /^(pr|p|c|i):\s*(.*)$/i;

const SCOPE_FROM_LETTER: Record<string, CommandScope> = {
  p: 'person',
  c: 'company',
  i: 'interaction',
  pr: 'project'
};

/**
 * Parse the cmd-K input. Recognised prefixes:
 *   p:foo   → search people only
 *   c:foo   → search companies only
 *   i:foo   → search interactions only
 *   pr:foo  → search projects only
 *
 * Returns the matched scope (if any) and the remaining query text. The
 * client uses the same regex purely for a visual indicator; the source of
 * truth lives here on the server.
 */
export function parseQueryScope(input: string): { scope: CommandScope | null; q: string } {
  const m = input.match(SCOPE_PREFIX_RE);
  if (!m) return { scope: null, q: input };
  return { scope: SCOPE_FROM_LETTER[m[1].toLowerCase()] ?? null, q: m[2] };
}

export async function searchAll(
  userId: string,
  region: string,
  rawQ: string,
  perKind = 5
): Promise<CommandHit[]> {
  const { scope, q } = parseQueryScope(rawQ);
  const fts = ftsQuery(q);
  if (!fts) return [];
  const d = db(region);

  // When a scope is forced, devote the whole budget to that table so the user
  // can scroll deeper into one kind.
  const SCOPED_LIMIT = perKind * 4;

  const wantPeople = !scope || scope === 'person';
  const wantCompanies = !scope || scope === 'company';
  const wantInteractions = !scope || scope === 'interaction';
  const wantProjects = !scope || scope === 'project';

  const [peopleRows, companyRows, interactionRows, projectRows] = await Promise.all([
    wantPeople
      ? d.all<{ id: string; name: string; role: string | null; domain: string | null }>(sql`
          SELECT p.id, p.name, p.role, p.domain
          FROM people p
          JOIN people_fts f ON f.rowid = p.rowid
          WHERE p.user_id = ${userId} AND f.people_fts MATCH ${fts} AND p.is_archived = 0
          ORDER BY rank
          LIMIT ${scope === 'person' ? SCOPED_LIMIT : perKind}
        `)
      : Promise.resolve([] as { id: string; name: string; role: string | null; domain: string | null }[]),
    wantCompanies
      ? d.all<{ id: string; name: string; description: string | null; domain: string | null }>(sql`
          SELECT c.id, c.name, c.description, c.domain
          FROM companies c
          JOIN companies_fts f ON f.rowid = c.rowid
          WHERE c.user_id = ${userId} AND f.companies_fts MATCH ${fts} AND c.is_archived = 0
          ORDER BY rank
          LIMIT ${scope === 'company' ? SCOPED_LIMIT : perKind}
        `)
      : Promise.resolve([] as { id: string; name: string; description: string | null; domain: string | null }[]),
    wantInteractions
      ? d.all<{ id: string; title: string; type: string; occurredAt: number }>(sql`
          SELECT i.id, i.title, i.type, i.occurred_at AS occurredAt
          FROM interactions i
          JOIN interactions_fts f ON f.rowid = i.rowid
          WHERE i.user_id = ${userId} AND f.interactions_fts MATCH ${fts}
          ORDER BY rank
          LIMIT ${scope === 'interaction' ? SCOPED_LIMIT : perKind}
        `)
      : Promise.resolve([] as { id: string; title: string; type: string; occurredAt: number }[]),
    wantProjects
      ? d.all<{ id: string; name: string; status: string; description: string | null }>(sql`
          SELECT p.id, p.name, p.status, p.description
          FROM projects p
          JOIN projects_fts f ON f.rowid = p.rowid
          WHERE p.user_id = ${userId}
            AND f.projects_fts MATCH ${fts}
            AND p.status != 'archived'
          ORDER BY rank
          LIMIT ${scope === 'project' ? SCOPED_LIMIT : perKind}
        `)
      : Promise.resolve([] as { id: string; name: string; status: string; description: string | null }[])
  ]);

  const hits: CommandHit[] = [];
  for (const p of peopleRows) {
    hits.push({
      kind: 'person',
      id: p.id,
      title: p.name,
      sub: p.role || p.domain,
      href: `/people/${p.id}`
    });
  }
  for (const c of companyRows) {
    hits.push({
      kind: 'company',
      id: c.id,
      title: c.name,
      sub: c.domain || c.description,
      href: `/companies/${c.id}`
    });
  }
  for (const i of interactionRows) {
    const when = new Date(i.occurredAt).toLocaleDateString();
    hits.push({
      kind: 'interaction',
      id: i.id,
      title: i.title,
      sub: `${i.type} · ${when}`,
      href: `/interactions/${i.id}`
    });
  }
  for (const p of projectRows) {
    hits.push({
      kind: 'project',
      id: p.id,
      title: p.name,
      sub: p.status === 'paused' ? 'paused' : p.description,
      href: `/projects/${p.id}`
    });
  }
  return hits;
}
