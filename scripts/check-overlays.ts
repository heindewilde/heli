/**
 * Overlay lint.
 *
 * Before src/lib/ui existed, twelve popovers and five modal surfaces each
 * hand-rolled their own markup: `fixed inset-0 z-50 bg-black/40`, a bare
 * `role="dialog"`, an Escape handler that closed every open layer at once, and
 * a body-scroll lock that two components fought over. Focus trapping and focus
 * restore were mostly absent.
 *
 * The primitives fix that once. This keeps it fixed: the moment someone writes
 * a new overlay by hand, the build fails and points at Popover/Dialog.
 *
 * Rules, all scoped to "outside src/lib/ui":
 *   A  `fixed inset-0`            — a scrim or modal container
 *   B  role="dialog" | aria-modal — a modal surface
 *   C  a numeric z-index class    — use the --z-* tokens in app.css
 *   D  $lib/client/* imported from server code — client caches are per-browser
 *      state; on the server one module instance is shared across every request
 *      and every tenant.
 *
 * Opt out by adding the file to ALLOW with a reason, same convention as
 * MEMBER_ALLOWED in check-tenancy.ts. There is no inline pragma on purpose:
 * an overlay is a whole-component decision, not a line-level one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src';
const UI = 'src/lib/ui/';

const ALLOW = new Map<string, string>([
  [
    'src/routes/+layout.svelte',
    'the app shell owns the sticky header and sidebar, which are the stacking context everything else sits in'
  ]
]);

type Rule = { name: string; test: RegExp; fix: string };

const RULES: Rule[] = [
  {
    name: 'hand-rolled overlay',
    test: /\bfixed\s+inset-0\b/,
    fix: 'use Dialog from $lib/ui'
  },
  {
    name: 'hand-rolled modal surface',
    test: /role=["']dialog["']|aria-modal/,
    fix: 'use Dialog (modal) or Popover (anchored) from $lib/ui'
  },
  {
    name: 'raw z-index',
    test: /(?:^|[\s"'`{])-?z-\[?\d/,
    fix: 'use z-[var(--z-popover)] / --z-dialog / --z-sticky / --z-toast'
  }
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|svelte)$/.test(full)) out.push(full);
  }
  return out;
}

const files = walk(ROOT).map((f) => f.replace(/\\/g, '/'));

const problems: string[] = [];
for (const rel of files) {
  if (rel.startsWith(UI)) continue;
  if (ALLOW.has(rel)) continue;
  if (/\.test\.ts$/.test(rel)) continue;
  const lines = readFileSync(rel, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.test.test(line)) {
        problems.push(`${rel}:${i + 1}  [${rule.name}] ${line.trim().slice(0, 88)}\n      → ${rule.fix}`);
        break;
      }
    }
  });
}

if (problems.length) {
  console.error('overlays: hand-rolled overlay markup outside src/lib/ui:\n');
  for (const p of problems) console.error('  ' + p);
  console.error(
    `\n${problems.length} problem(s). Use the primitives in src/lib/ui, or add the file to ` +
      'ALLOW in scripts/check-overlays.ts with the reason it owns its own stacking.'
  );
  process.exit(1);
}

console.log(`overlays: ${files.length} files, no hand-rolled overlays outside src/lib/ui`);

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Rule D: client-only state must not be reachable from the server.
 *
 * Modules under src/lib/client hold per-browser state — the optimistic list
 * cache, and the entity cache that follows. On the server a module is
 * instantiated once per process, not once per request, so importing one there
 * shares one map across every concurrent request and every tenant. That is the
 * same failure the search LRU had to be keyed by workspace to avoid.
 */

const SERVER_FILE = /(^src\/lib\/server\/|\.server\.ts$|^src\/hooks\.server\.ts$)/;
const CLIENT_IMPORT = /from\s+['"](?:\$lib\/client\/|\.\.?\/[\w./-]*client\/)/;

const leaks: string[] = [];
for (const rel of files) {
  if (!SERVER_FILE.test(rel)) continue;
  const lines = readFileSync(rel, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (CLIENT_IMPORT.test(line)) leaks.push(`${rel}:${i + 1}  ${line.trim()}`);
  });
}

if (leaks.length) {
  console.error('overlays: client-only modules imported from server code:\n');
  for (const p of leaks) console.error('  ' + p);
  console.error(
    `\n${leaks.length} problem(s). A module under src/lib/client holds per-browser state; ` +
      'on the server it would be shared across every request and every tenant.'
  );
  process.exit(1);
}

console.log('overlays: no client-only state reachable from server code');
