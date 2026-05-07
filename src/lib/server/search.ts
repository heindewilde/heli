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
  kind: 'person' | 'company' | 'interaction';
  id: string;
  title: string;
  sub: string | null;
  href: string;
};

export async function searchAll(
  userId: string,
  region: string,
  q: string,
  perKind = 5
): Promise<CommandHit[]> {
  const fts = ftsQuery(q);
  if (!fts) return [];
  const d = db(region);

  const [peopleRows, companyRows, interactionRows] = await Promise.all([
    d.all<{ id: string; name: string; role: string | null; domain: string | null }>(sql`
      SELECT p.id, p.name, p.role, p.domain
      FROM people p
      JOIN people_fts f ON f.rowid = p.rowid
      WHERE p.user_id = ${userId} AND f.people_fts MATCH ${fts} AND p.is_archived = 0
      ORDER BY rank
      LIMIT ${perKind}
    `),
    d.all<{ id: string; name: string; description: string | null; domain: string | null }>(sql`
      SELECT c.id, c.name, c.description, c.domain
      FROM companies c
      JOIN companies_fts f ON f.rowid = c.rowid
      WHERE c.user_id = ${userId} AND f.companies_fts MATCH ${fts} AND c.is_archived = 0
      ORDER BY rank
      LIMIT ${perKind}
    `),
    d.all<{ id: string; title: string; type: string; occurredAt: number }>(sql`
      SELECT i.id, i.title, i.type, i.occurred_at AS occurredAt
      FROM interactions i
      JOIN interactions_fts f ON f.rowid = i.rowid
      WHERE i.user_id = ${userId} AND f.interactions_fts MATCH ${fts}
      ORDER BY rank
      LIMIT ${perKind}
    `)
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
  return hits;
}
