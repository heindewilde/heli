/**
 * FTS5 query helpers. SQLite FTS5 has its own MATCH grammar; raw user input
 * can blow up with reserved characters (`"`, `*`, `:`, etc.). We normalize
 * to a prefix-match-per-token query.
 */

import { sql } from 'drizzle-orm';
import { db } from './db';
import type { Scope } from './scope';

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
  kind: 'person' | 'company' | 'interaction' | 'project' | 'collection' | 'pipeline';
  id: string;
  title: string;
  sub: string | null;
  href: string;
  avatarUrl?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  domain?: string | null;
};

export type CommandScope =
  | 'person'
  | 'company'
  | 'interaction'
  | 'project'
  | 'collection'
  | 'pipeline';

// Multi-letter prefixes MUST come before single-letter ones, so the regex
// engine tries them first when alternating left-to-right. Otherwise "pl:foo"
// parses as scope=person query="l:foo".
const SCOPE_PREFIX_RE = /^(col|pl|pr|p|c|i):\s*(.*)$/i;

const SCOPE_FROM_LETTER: Record<string, CommandScope> = {
  p: 'person',
  c: 'company',
  i: 'interaction',
  pr: 'project',
  col: 'collection',
  pl: 'pipeline'
};

/**
 * Parse the cmd-K input. Recognised prefixes:
 *   p:foo    → search people only
 *   c:foo    → search companies only
 *   i:foo    → search interactions only
 *   pr:foo   → search projects only
 *   col:foo  → search collections only
 *   pl:foo   → search pipelines only
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

// Tiny in-memory LRU around searchAll. Same user typing "ali" → "alic" →
// backspace → "ali" again is the common case: the second "ali" hits the
// cache and skips six FTS5 round-trips. Per-process, so multi-region
// deployments naturally have one cache per region.
type CacheEntry = { value: CommandHit[]; expiresAt: number };
const CACHE_MAX = 256;
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): CommandHit[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  // Bump recency: re-insert moves the key to the end of the iteration order.
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function cacheSet(key: string, value: CommandHit[]): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

// Bumped whenever a workspace writes a searchable row. Folded into the cache
// key so a colleague's new person shows up immediately rather than after the
// 30s TTL — with one writer that lag was invisible, with a team it isn't.
const epochs = new Map<string, number>();

export function bumpSearchEpoch(workspaceId: string): void {
  epochs.set(workspaceId, (epochs.get(workspaceId) ?? 0) + 1);
}

export async function searchAll(
  s: Scope,
  rawQ: string,
  perKind = 5
): Promise<CommandHit[]> {
  // Keyed by workspace, NOT user — keying by user here while the queries below
  // filter by workspace would be a cross-tenant leak straight out of the cache.
  const epoch = epochs.get(s.workspaceId) ?? 0;
  const cacheKey = `${s.region}:${s.workspaceId}:${epoch}:${perKind}:${rawQ}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const { scope, q } = parseQueryScope(rawQ);
  const fts = ftsQuery(q);
  if (!fts) return [];
  const d = db(s.region);

  // When a scope is forced, devote the whole budget to that table so the user
  // can scroll deeper into one kind.
  const SCOPED_LIMIT = perKind * 4;

  const wantPeople = !scope || scope === 'person';
  const wantCompanies = !scope || scope === 'company';
  const wantInteractions = !scope || scope === 'interaction';
  const wantProjects = !scope || scope === 'project';
  const wantCollections = !scope || scope === 'collection';
  const wantPipelines = !scope || scope === 'pipeline';

  const [peopleRows, companyRows, interactionRows, projectRows, collectionRows, pipelineRows] = await Promise.all([
    wantPeople
      ? d.all<{ id: string; name: string; role: string | null; domain: string | null; avatarUrl: string | null }>(sql`
          SELECT p.id, p.name, p.role, p.domain, p.avatar_url AS avatarUrl
          FROM people p
          JOIN people_fts f ON f.rowid = p.rowid
          WHERE p.workspace_id = ${s.workspaceId} AND f.people_fts MATCH ${fts} AND p.is_archived = 0
          ORDER BY rank
          LIMIT ${scope === 'person' ? SCOPED_LIMIT : perKind}
        `)
      : Promise.resolve([] as { id: string; name: string; role: string | null; domain: string | null; avatarUrl: string | null }[]),
    wantCompanies
      ? d.all<{ id: string; name: string; description: string | null; domain: string | null; logoUrl: string | null; faviconUrl: string | null }>(sql`
          SELECT c.id, c.name, c.description, c.domain, c.logo_url AS logoUrl, c.favicon_url AS faviconUrl
          FROM companies c
          JOIN companies_fts f ON f.rowid = c.rowid
          WHERE c.workspace_id = ${s.workspaceId} AND f.companies_fts MATCH ${fts} AND c.is_archived = 0
          ORDER BY rank
          LIMIT ${scope === 'company' ? SCOPED_LIMIT : perKind}
        `)
      : Promise.resolve([] as { id: string; name: string; description: string | null; domain: string | null; logoUrl: string | null; faviconUrl: string | null }[]),
    wantInteractions
      ? d.all<{ id: string; title: string; type: string; occurredAt: number }>(sql`
          SELECT i.id, i.title, i.type, i.occurred_at AS occurredAt
          FROM interactions i
          JOIN interactions_fts f ON f.rowid = i.rowid
          WHERE i.workspace_id = ${s.workspaceId} AND f.interactions_fts MATCH ${fts}
          ORDER BY rank
          LIMIT ${scope === 'interaction' ? SCOPED_LIMIT : perKind}
        `)
      : Promise.resolve([] as { id: string; title: string; type: string; occurredAt: number }[]),
    wantProjects
      ? d.all<{ id: string; name: string; status: string; description: string | null }>(sql`
          SELECT p.id, p.name, p.status, p.description
          FROM projects p
          JOIN projects_fts f ON f.rowid = p.rowid
          WHERE p.workspace_id = ${s.workspaceId}
            AND f.projects_fts MATCH ${fts}
            AND p.status != 'archived'
          ORDER BY rank
          LIMIT ${scope === 'project' ? SCOPED_LIMIT : perKind}
        `)
      : Promise.resolve([] as { id: string; name: string; status: string; description: string | null }[]),
    wantCollections
      ? d.all<{ id: string; name: string; description: string | null }>(sql`
          SELECT c.id, c.name, c.description
          FROM collections c
          JOIN collections_fts f ON f.rowid = c.rowid
          WHERE c.workspace_id = ${s.workspaceId}
            AND f.collections_fts MATCH ${fts}
            AND c.is_archived = 0
          ORDER BY rank
          LIMIT ${scope === 'collection' ? SCOPED_LIMIT : perKind}
        `)
      : Promise.resolve([] as { id: string; name: string; description: string | null }[]),
    wantPipelines
      ? d.all<{ id: string; name: string; description: string | null }>(sql`
          SELECT p.id, p.name, p.description
          FROM pipelines p
          JOIN pipelines_fts f ON f.rowid = p.rowid
          WHERE p.workspace_id = ${s.workspaceId}
            AND f.pipelines_fts MATCH ${fts}
            AND p.is_archived = 0
          ORDER BY rank
          LIMIT ${scope === 'pipeline' ? SCOPED_LIMIT : perKind}
        `)
      : Promise.resolve([] as { id: string; name: string; description: string | null }[])
  ]);

  const hits: CommandHit[] = [];
  for (const p of peopleRows) {
    hits.push({
      kind: 'person',
      id: p.id,
      title: p.name,
      sub: p.role || p.domain,
      href: `/people/${p.id}`,
      avatarUrl: p.avatarUrl
    });
  }
  for (const c of companyRows) {
    hits.push({
      kind: 'company',
      id: c.id,
      title: c.name,
      sub: c.domain || c.description,
      href: `/companies/${c.id}`,
      domain: c.domain,
      logoUrl: c.logoUrl,
      faviconUrl: c.faviconUrl
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
  for (const c of collectionRows) {
    hits.push({
      kind: 'collection',
      id: c.id,
      title: c.name,
      sub: c.description,
      href: `/collections/${c.id}`
    });
  }
  for (const p of pipelineRows) {
    hits.push({
      kind: 'pipeline',
      id: p.id,
      title: p.name,
      sub: p.description,
      href: `/pipelines/${p.id}`
    });
  }
  cacheSet(cacheKey, hits);
  return hits;
}
