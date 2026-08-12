import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * The modules the web app shares with the mobile app must stay importable *by
 * the mobile app*, and that is a stronger constraint than it sounds.
 *
 * `mobile/metro.config.js` blocks the repo root's `node_modules` outright, so a
 * shared module has no fallback resolution: the moment one of them grows an
 * import of `drizzle-orm`, `lucide-svelte`, `$lib/...` or `$app/...`, the mobile
 * bundle stops building. That failure surfaces only in the mobile CI job, in a
 * different install, long after the change that caused it — and the change
 * itself looks entirely reasonable in the web app, where every one of those
 * imports is fine.
 *
 * So this runs in `npm run check`, next to the web code being edited. It reads
 * the shared list out of `mobile/tsconfig.json` rather than keeping a second
 * copy, because that file already has to name every module for type-checking —
 * one list, and adding a module to it is the moment you find out whether it is
 * actually portable.
 *
 * Three rules:
 *   A. every shared module imports only other shared modules or node builtins
 *   B. mobile only reaches into `src/lib` for modules on the list
 *   C. nothing under `mobile/` is a *copy* of a shared module
 *
 * Skipped entirely when `mobile/` is absent, so a shallow checkout or a branch
 * from before the app existed still passes.
 */

const MOBILE = 'mobile';
const TSCONFIG = join(MOBILE, 'tsconfig.json');

if (!existsSync(TSCONFIG)) {
  console.log('shared: mobile/ not present, skipping');
  process.exit(0);
}

/* ── the manifest ────────────────────────────────────────────────────────── */

// Comments are legal in a tsconfig and this one is heavily commented, so strip
// them before parsing. Whole-line `//` only, deliberately: a general block-comment
// strip ate the `/*` inside `"@/*": ["./src/*"]` and swallowed the rest of the
// file. Same class of mistake `scripts/tokens.mjs` documents for app.css, and
// the same fix — know what the input actually looks like rather than writing
// the general case badly.
const raw = readFileSync(TSCONFIG, 'utf8').replace(/^\s*\/\/.*$/gm, '');
const include: string[] = JSON.parse(raw).include ?? [];

/** Paths are relative to mobile/, e.g. `../src/lib/duration.ts` → `src/lib/duration.ts`. */
const shared = new Set(
  include
    .filter((p) => p.startsWith('../src/lib/'))
    .map((p) => relative('.', resolve(MOBILE, p)).replace(/\\/g, '/'))
);

if (shared.size === 0) {
  console.error('shared: mobile/tsconfig.json lists no ../src/lib modules — did the include list move?');
  process.exit(1);
}

const problems: string[] = [];

for (const f of shared) {
  if (!existsSync(f)) {
    problems.push(`${TSCONFIG} lists ${f}, which does not exist`);
  }
}

/* ── rule A: shared modules import only shared modules ───────────────────── */

/**
 * Import specifiers, and only those.
 *
 * Two things this had to learn. `[^;]` stops a match crossing a statement
 * boundary — without it an `export function` matched a `from '…'` many lines
 * later. And comments have to go first: `duration.ts` contains the sentence
 * `so a caller can tell "empty" from "zero"`, which is a syntactically perfect
 * import specifier and reported the package `zero` as a dependency.
 */
const IMPORT_RE = /^\s*(?:import|export)\s[^;]*?\bfrom\s*['"]([^'"]+)['"]/gm;
const BUILTIN = /^node:/;

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

for (const file of shared) {
  if (!existsSync(file)) continue;
  const src = code(readFileSync(file, 'utf8'));
  for (const [, spec] of src.matchAll(IMPORT_RE)) {
    if (BUILTIN.test(spec)) continue;

    if (spec.startsWith('$lib') || spec.startsWith('$app') || spec.startsWith('$env')) {
      problems.push(
        `${file} imports '${spec}' — SvelteKit aliases do not exist in Metro. Use a relative path.`
      );
      continue;
    }
    if (!spec.startsWith('.')) {
      problems.push(
        `${file} imports the package '${spec}'. Shared modules must be dependency-free: ` +
          `mobile/metro.config.js blocks the root node_modules, so this will not resolve there.`
      );
      continue;
    }

    // A relative import has to land on another shared module.
    const target = relative('.', resolve(dirname(file), spec)).replace(/\\/g, '/');
    const hit = [target, `${target}.ts`, `${target}/index.ts`].find((c) => shared.has(c));
    if (!hit) {
      problems.push(
        `${file} imports '${spec}', which is not on the shared list in ${TSCONFIG}. ` +
          `Add it there (and check it is portable), or inline what is needed.`
      );
    }
  }
}

/* ── rules B and C: what mobile does with them ───────────────────────────── */

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const mobileFiles = [...walk(join(MOBILE, 'src')), ...walk(join(MOBILE, 'app'))];

for (const file of mobileFiles) {
  const src = code(readFileSync(file, 'utf8'));
  for (const [, spec] of src.matchAll(IMPORT_RE)) {
    if (!spec.includes('src/lib/')) continue;
    const target = relative('.', resolve(dirname(file), spec)).replace(/\\/g, '/');
    const hit = [target, `${target}.ts`, `${target}/index.ts`].find((c) => shared.has(c));
    if (!hit) {
      problems.push(
        `${file} imports '${spec}', which is not on the shared list in ${TSCONFIG}. ` +
          `Add it there so it is type-checked and portability-linted.`
      );
    }
  }
}

/**
 * Rule C: copy detection.
 *
 * A copy is the failure this whole arrangement exists to prevent — the rules
 * that decide whether two spellings of a LinkedIn URL are the same record have
 * to be one implementation, or the app and the server disagree about identity.
 * `tests/extension-adapters.test.ts` asserts the extension's import string for
 * exactly this reason; this generalises it.
 *
 * A distinctive line from each shared module is enough: nobody re-types a
 * comment or an unusual regex when copying, and a false positive is a
 * conversation rather than a silent divergence.
 */
for (const file of shared) {
  if (!existsSync(file)) continue;
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 45 && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'));
  const fingerprint = lines.sort((a, b) => b.length - a.length)[0];
  if (!fingerprint) continue;

  for (const mf of mobileFiles) {
    if (readFileSync(mf, 'utf8').includes(fingerprint)) {
      problems.push(
        `${mf} appears to contain a copy of ${file} (matched: ${fingerprint.slice(0, 60)}…). ` +
          `Import it by relative path instead — one implementation, or the two drift.`
      );
    }
  }
}

if (problems.length > 0) {
  console.error('shared: portability violations\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    `\n${problems.length} problem(s). See MOBILE.md for why shared modules must stay dependency-free.`
  );
  process.exit(1);
}

console.log(
  `shared: ${shared.size} modules shared with mobile, all dependency-free and imported, not copied`
);
