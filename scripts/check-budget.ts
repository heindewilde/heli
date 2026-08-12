/**
 * Footprint report.
 *
 * Being lightweight is a product claim, and a claim nobody measures drifts.
 * `craft-and-capture` landed 22k lines without anyone watching the numbers, and
 * by the end the app shell was carrying a SHA-512 implementation to key a toast
 * and 18 KB of typography CSS for five call sites. Neither was a decision — both
 * were arrived at.
 *
 * So this prints the four numbers that actually move, on every `npm run check`,
 * with the delta against a committed baseline.
 *
 * It is deliberately **report-only**: it never exits non-zero. A budget that
 * fails the build gets its threshold raised by whoever is in a hurry, which
 * teaches everyone that the number is negotiable. A number printed next to its
 * baseline on every run is harder to ignore and impossible to quietly raise —
 * moving BASELINE is a diff a reviewer sees.
 *
 * The correctness sibling is `check-externals.ts`, which *does* fail: shipping a
 * runtime import that prod `node_modules` cannot resolve is a broken image, not
 * a matter of taste.
 *
 * Requires `npm run build` to have run. Without build output it says so and
 * still reports the dependency closure, which is computed from the lockfile.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

/**
 * Committed on the branch that did the lightweightness pass. Update these in the
 * same commit that moves them, so the diff says what changed and why.
 */
const BASELINE = {
  shellJsGzip: 74_342,
  shellCssGzip: 10_444,
  largestRouteGzip: 47_002,
  prodPackages: 23,
  prodBytes: 12_214_272
};

const CLIENT = 'build/client';
const MANIFEST = '.svelte-kit/output/client/.vite/manifest.json';

type Chunk = { file: string; imports?: string[]; css?: string[]; isEntry?: boolean };

function kb(n: number): string {
  return (n / 1024).toFixed(1) + ' KB';
}

/** Same compression level Node's zlib defaults to, which is what `maybeCompress` uses. */
function sizes(files: Set<string>): { raw: number; gzip: number } {
  let raw = 0;
  let gzip = 0;
  for (const f of files) {
    const p = join(CLIENT, f);
    if (!existsSync(p)) continue;
    const buf = readFileSync(p);
    raw += buf.length;
    gzip += gzipSync(buf).length;
  }
  return { raw, gzip };
}

function delta(now: number, was: number, unit: 'bytes' | 'count'): string {
  const d = now - was;
  // Sub-KB drift is build-to-build noise (hashed filenames change length); a
  // report that cries "+0.0 KB" on every run trains people to stop reading it.
  if (unit === 'bytes' ? Math.abs(d) < 512 : d === 0) return '  (unchanged)';
  const sign = d > 0 ? '+' : '−';
  const body = unit === 'bytes' ? kb(Math.abs(d)) : String(Math.abs(d));
  const pct = was === 0 ? '' : ` / ${((Math.abs(d) / was) * 100).toFixed(1)}%`;
  return `  (${sign}${body}${pct} vs baseline)`;
}

/* ── Client bundle ─────────────────────────────────────────────────────────── */

function clientReport(): void {
  if (!existsSync(MANIFEST)) {
    console.log('budget: no client build output — run `npm run build` for bundle numbers');
    return;
  }
  const manifest: Record<string, Chunk> = JSON.parse(readFileSync(MANIFEST, 'utf8'));

  /**
   * Static closure only. `dynamicImports` are deliberately excluded: a lazily
   * imported chunk is the fix, not the cost, and counting it would make
   * `{#await import(...)}` look like a regression.
   */
  function closure(keys: string[]): { js: Set<string>; css: Set<string> } {
    const js = new Set<string>();
    const css = new Set<string>();
    const seen = new Set<string>();
    const stack = [...keys];
    while (stack.length) {
      const k = stack.pop()!;
      if (seen.has(k)) continue;
      seen.add(k);
      const c = manifest[k];
      if (!c) continue;
      js.add(c.file);
      for (const s of c.css ?? []) css.add(s);
      for (const i of c.imports ?? []) stack.push(i);
    }
    return { js, css };
  }

  /**
   * The shell is what *every* route pays: Kit's client entry, the generated app
   * module, and node 0 (the root layout). Anything a single route adds on top is
   * that route's own weight, reported separately below.
   */
  const shellKeys = Object.keys(manifest).filter(
    (k) => /client-optimized\/(app|nodes\/0)\.js$/.test(k) || /runtime\/client\/entry\.js$/.test(k)
  );
  const shell = closure(shellKeys);
  const shellJs = sizes(shell.js);
  const shellCss = sizes(shell.css);

  let worst = { name: '', raw: 0, gzip: 0 };
  for (const key of Object.keys(manifest)) {
    const m = /client-optimized\/nodes\/(\d+)\.js$/.exec(key);
    if (!m || m[1] === '0') continue;
    const own = closure([key]);
    // Incremental: what this route adds on top of the shell the user already has.
    for (const f of shell.js) own.js.delete(f);
    for (const f of shell.css) own.css.delete(f);
    const s = sizes(own.js);
    const c = sizes(own.css);
    const gzip = s.gzip + c.gzip;
    if (gzip > worst.gzip) worst = { name: `node ${m[1]}`, raw: s.raw + c.raw, gzip };
  }

  console.log(`budget: app-shell JS      ${kb(shellJs.raw).padStart(9)} raw  ${kb(shellJs.gzip).padStart(9)} gzip${delta(shellJs.gzip, BASELINE.shellJsGzip, 'bytes')}`);
  console.log(`budget: app-shell CSS     ${kb(shellCss.raw).padStart(9)} raw  ${kb(shellCss.gzip).padStart(9)} gzip${delta(shellCss.gzip, BASELINE.shellCssGzip, 'bytes')}`);
  console.log(`budget: heaviest route    ${kb(worst.raw).padStart(9)} raw  ${kb(worst.gzip).padStart(9)} gzip  (${worst.name}, on top of the shell)${delta(worst.gzip, BASELINE.largestRouteGzip, 'bytes')}`);
}

/* ── Production dependency closure ─────────────────────────────────────────── */

/**
 * Walks `package-lock.json` from `dependencies` only — the set that survives
 * `npm prune --omit=dev` and is copied into the runtime image. Reading the
 * lockfile rather than shelling out to `npm ls` keeps this honest even when the
 * local tree has drifted, and fast enough to run on every check.
 */
function depReport(): void {
  if (!existsSync('package-lock.json')) return;
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const pkgs: Record<string, { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }> = lock.packages;

  // npm's resolution walk: look for the package hoisted nearest to the importer.
  function resolve(from: string, name: string): string | null {
    const parts = from === '' ? [] : from.split('/node_modules/').slice(1);
    for (let i = parts.length; i >= 0; i--) {
      const prefix = i ? `node_modules/${parts.slice(0, i).join('/node_modules/')}/` : '';
      const cand = `${prefix}node_modules/${name}`;
      if (pkgs[cand]) return cand;
    }
    return null;
  }

  const seen = new Set<string>();
  const stack: string[] = [];
  for (const name of Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).dependencies ?? {})) {
    const r = resolve('', name);
    if (r) stack.push(r);
  }
  while (stack.length) {
    const k = stack.pop()!;
    if (seen.has(k)) continue;
    seen.add(k);
    const p = pkgs[k];
    if (!p) continue;
    for (const d of [...Object.keys(p.dependencies ?? {}), ...Object.keys(p.optionalDependencies ?? {})]) {
      const r = resolve(k, d);
      if (r && !seen.has(r)) stack.push(r);
    }
  }

  let bytes = 0;
  let measured = 0;
  for (const k of seen) {
    if (!existsSync(k)) continue;
    measured++;
    try {
      // `du -sk` over ~100 directories is one subprocess and beats a recursive
      // JS walk by enough to matter on every check.
      bytes += parseInt(execFileSync('du', ['-sk', k], { encoding: 'utf8' }).split('\t')[0], 10) * 1024;
    } catch {
      /* a package the local tree hasn't installed just doesn't contribute */
    }
  }

  const note = measured < seen.size ? `  (${seen.size - measured} not installed locally)` : '';
  console.log(`budget: prod packages     ${String(seen.size).padStart(9)}${delta(seen.size, BASELINE.prodPackages, 'count')}`);
  console.log(`budget: prod node_modules ${kb(bytes).padStart(9)}${delta(bytes, BASELINE.prodBytes, 'bytes')}${note}`);
}

/* ── Static assets ─────────────────────────────────────────────────────────── */

function staticReport(): void {
  if (!existsSync('static')) return;
  const bytes = parseInt(execFileSync('du', ['-sk', 'static'], { encoding: 'utf8' }).split('\t')[0], 10) * 1024;
  const font = 'static/fonts/Geist-Variable.woff2';
  const fontNote = existsSync(font) ? `, ${kb(statSync(font).size)} of it the preloaded font` : '';
  console.log(`budget: static/           ${kb(bytes).padStart(9)}${fontNote}`);
}

clientReport();
depReport();
staticReport();
