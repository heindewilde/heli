/**
 * Runtime-externals check. Runs after `vite build`, and **fails the build**.
 *
 * `adapter-node` bundles the server, treating exactly the entries in
 * `dependencies` as external and inlining everything else. The Dockerfile then
 * runs `npm prune --omit=dev` and copies `node_modules` into the runtime image —
 * so an import that survives bundling but is *not* in `dependencies` resolves
 * fine on a dev machine, where devDependencies are still installed, and throws
 * ERR_MODULE_NOT_FOUND the first time the container serves a request.
 *
 * That failure mode is invisible to `npm run check`, invisible to the tests, and
 * only appears in production. So this asserts the two lists agree: every bare
 * import the built server makes is either a `node:` builtin or a current
 * `dependencies` entry.
 *
 * It is the reason moving a package between `dependencies` and `devDependencies`
 * is a safe thing to try rather than a gamble. Its report-only sibling is
 * `check-budget.ts`, which measures taste; this one guards correctness.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';

/**
 * Builtins resolve whether or not they carry the `node:` prefix, and bundled CJS
 * dependencies routinely emit the bare spelling (`require('path')` becomes
 * `import ... from 'path'`). Treating those as missing packages would fail the
 * build over imports that cannot fail.
 */
const BUILTIN = new Set(builtinModules);

const ROOTS = ['build/server', 'build/handler.js', 'build/index.js'];

function jsFiles(path: string, out: string[] = []): string[] {
  if (!existsSync(path)) return out;
  if (statSync(path).isFile()) {
    if (path.endsWith('.js')) out.push(path);
    return out;
  }
  for (const entry of readdirSync(path)) jsFiles(join(path, entry), out);
  return out;
}

const files = ROOTS.flatMap((r) => jsFiles(r));
if (files.length === 0) {
  console.error('externals: no build output found — run `vite build` first');
  process.exit(1);
}

/**
 * Line-anchored on purpose. A bundled chunk is full of `from '...'` inside
 * string literals, comments and template output; only a statement starting at
 * column zero is an actual import the runtime will try to resolve.
 */
const IMPORT = /^(?:import|export)\b[^'"]*from\s*['"]([^'"]+)['"]/;
const BARE_IMPORT = /^import\s*['"]([^'"]+)['"]/;

const declared = new Set(
  Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).dependencies ?? {})
);

/** `drizzle-orm/libsql` is served by the `drizzle-orm` entry in package.json. */
function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const missing = new Map<string, string[]>();
for (const file of files) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const spec = (IMPORT.exec(line) ?? BARE_IMPORT.exec(line))?.[1];
    if (!spec) continue;
    if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('#')) continue;
    if (spec.startsWith('node:')) continue;
    const pkg = packageOf(spec);
    if (BUILTIN.has(pkg)) continue;
    if (declared.has(pkg)) continue;
    const seen = missing.get(pkg) ?? [];
    if (!seen.includes(file)) seen.push(file);
    missing.set(pkg, seen);
  }
}

if (missing.size) {
  console.error('externals: the built server imports packages that production will not install:\n');
  for (const [pkg, where] of missing) {
    console.error(`  ${pkg}\n      imported by ${where.slice(0, 3).join(', ')}`);
  }
  console.error(
    '\nEither add it to "dependencies" in package.json, or find out why the bundler ' +
      'left it external. Left as is, the Docker image throws ERR_MODULE_NOT_FOUND at runtime.'
  );
  process.exit(1);
}

const used = new Set<string>();
for (const file of files) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const spec = (IMPORT.exec(line) ?? BARE_IMPORT.exec(line))?.[1];
    if (!spec) continue;
    if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('#')) continue;
    if (spec.startsWith('node:')) continue;
    const pkg = packageOf(spec);
    if (!BUILTIN.has(pkg)) used.add(pkg);
  }
}

const unused = [...declared].filter((d) => !used.has(d));
console.log(
  `externals: ${used.size} runtime package(s), all declared` +
    (unused.length
      ? `\nexternals: note — declared but never imported by the built server: ${unused.join(', ')}`
      : '')
);
