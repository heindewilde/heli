import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Web and mobile are two clients of one API. This is what stops them drifting.
 *
 * The failure it prevents is slow and invisible: someone adds a v1 endpoint for
 * a web feature, nobody decides what the app does about it, and a year later
 * the two products share a database and nothing else. "Keep them in sync" is a
 * good intention; a build failure is a mechanism.
 *
 * Three rules:
 *   A. every `/api/v1` route+method is reachable from `mobile/src/api/endpoints.ts`,
 *      or is listed in WEB_ONLY with a reason
 *   B. every path the client calls exists as a route
 *   C. every route is documented in API.md
 *
 * Deliberately textual — no TypeScript program, no `mobile/node_modules` — so it
 * runs inside `npm run check` next to the code being changed, rather than in
 * the separate mobile CI job where the feedback arrives too late to matter.
 */

const V1 = 'src/routes/api/v1';
const CLIENT = 'mobile/src/api/endpoints.ts';
const DOCS = 'API.md';

/**
 * Endpoints the app deliberately does not call, and why.
 *
 * Every entry here is a decision someone made on purpose. Adding one is the
 * cheap part; the value is that it cannot happen by accident.
 */
const WEB_ONLY = new Map<string, string>([
  [
    'POST /tokens',
    'cookie-session only — a bearer credential must not mint another (denyBearer)'
  ],
  ['GET /tokens', 'cookie-session only, same reason'],
  ['DELETE /tokens/:id', 'cookie-session only, same reason'],
  ['POST /pairing', 'cookie-session only: pairing is initiated from a signed-in browser'],
  ['GET /pairing/:code', 'cookie-session only: the browser polls its own code'],
  ['DELETE /pairing/:code', 'cookie-session only'],
  [
    'POST /pairing/claim',
    'called before the client exists, so it lives in client.ts rather than the authed map'
  ],
  ['GET /devices', 'cookie-session only: listing and revoking other devices is account management'],
  ['DELETE /devices/:id', 'cookie-session only, same reason']
]);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === '+server.ts') out.push(full);
  }
  return out;
}

if (!existsSync(CLIENT)) {
  console.log('parity: mobile client not present, skipping');
  process.exit(0);
}

/** `src/routes/api/v1/people/[id]/+server.ts` → `/people/:id` */
function routePath(file: string): string {
  const rel = relative(V1, file).replace(/\\/g, '/').replace(/\/\+server\.ts$/, '');
  return (
    '/' +
    rel
      .split('/')
      .map((seg) => (seg.startsWith('[') ? `:${seg.slice(1, -1)}` : seg))
      .join('/')
  );
}

const METHODS = /export const (GET|POST|PATCH|PUT|DELETE)\b/g;

const routes: { key: string; path: string; method: string }[] = [];
for (const file of walk(V1)) {
  const src = readFileSync(file, 'utf8');
  const path = routePath(file);
  for (const [, method] of src.matchAll(METHODS)) {
    routes.push({ key: `${method} ${path}`, path, method });
  }
}

if (routes.length === 0) {
  console.error('parity: found no /api/v1 routes — did the tree move?');
  process.exit(1);
}

const client = readFileSync(CLIENT, 'utf8');

/**
 * The paths the client calls, normalised to the route shape.
 *
 * Split on `request<` rather than matching the whole call with one regex. The
 * type argument routinely contains `>` — `Paged<PersonRow>`, an inline object —
 * so `request<[^>]*>` ends in the middle of it and everything after is
 * misparsed; and a tail pattern that runs to the next `;` reads the *following*
 * call's method. Chunking gives each call a natural boundary.
 *
 * Template holes become `:param` so `/people/${id}` matches `/people/:id`. The
 * method comes from the `method:` option, defaulting to GET as `request` does.
 */
const calls = new Set<string>();
for (const chunk of client.split('request<').slice(1)) {
  // The path is the first string literal after the closing `>(` of the generic.
  const literal = /\(\s*(?:`([^`]+)`|'([^']+)')/.exec(chunk);
  if (!literal) continue;
  const raw = literal[1] ?? literal[2];
  if (!raw.startsWith('/')) continue;

  const path = raw.replace(/\$\{[^}]+\}/g, ':param');
  const method = /method:\s*'(GET|POST|PATCH|PUT|DELETE)'/.exec(chunk)?.[1] ?? 'GET';
  calls.add(`${method} ${path}`);
}

// Param names differ between the route (`:id`) and the call (`:param`).
const normalise = (key: string) => key.replace(/:[A-Za-z]+/g, ':param');
const called = new Set([...calls].map(normalise));

const problems: string[] = [];

/* Rule A — every route is either used or consciously skipped. */
for (const route of routes) {
  if (WEB_ONLY.has(route.key)) continue;
  if (called.has(normalise(route.key))) continue;
  problems.push(
    `${route.key} has no method in ${CLIENT}. Add one, or add it to WEB_ONLY in ` +
      `scripts/check-parity.ts with the reason the app does not use it.`
  );
}

/* Rule B — the client does not call anything that is not there. */
const routeKeys = new Set(routes.map((r) => normalise(r.key)));
for (const call of called) {
  if (!routeKeys.has(call)) {
    problems.push(`${CLIENT} calls ${call}, which is not a route under ${V1}.`);
  }
}

/* Rule C — the public API is documented. */
if (existsSync(DOCS)) {
  const docs = readFileSync(DOCS, 'utf8');
  const undocumented = routes.filter((r) => {
    // Match the path with either spelling of a parameter, as prose uses both.
    const loose = r.path.replace(/:([A-Za-z]+)/g, '[^\\s`)]+');
    return !new RegExp(`${r.method}[^\\n]*${loose}`).test(docs);
  });
  // Reported, not fatal: docs lag by design during a wave, and a build that
  // fails on prose is a build people learn to bypass.
  if (undocumented.length > 0) {
    console.log(
      `parity: ${undocumented.length} endpoint(s) not yet in ${DOCS} — ` +
        undocumented
          .slice(0, 6)
          .map((r) => r.key)
          .join(', ') +
        (undocumented.length > 6 ? ', …' : '')
    );
  }
}

if (problems.length > 0) {
  console.error('parity: web and mobile disagree about the API\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.log(
  `parity: ${routes.length} v1 endpoints, ${routes.length - WEB_ONLY.size} reachable from mobile, ` +
    `${WEB_ONLY.size} web-only by decision`
);
