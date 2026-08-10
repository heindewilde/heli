import { context, build as esbuild } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTokens } from './tokens.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const repo = resolve(root, '..');
const out = resolve(root, 'dist');

const watch = process.argv.includes('--watch');

mkdirSync(out, { recursive: true });

/* Styles: generated palette + the popup's own layout. */
writeFileSync(resolve(out, 'tokens.css'), extractTokens(resolve(repo, 'src/app.css')));
cpSync(resolve(root, 'popup.css'), resolve(out, 'popup.css'));

/* HTML shells. Each is a fragment; the wrapper is added here so the two files
   cannot disagree about which stylesheets to load. */
for (const page of ['popup', 'options']) {
  const body = readFileSync(resolve(root, `${page}.html`), 'utf8');
  writeFileSync(
    resolve(out, `${page}.html`),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Heli</title>
    <link rel="stylesheet" href="tokens.css" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body class="${page}">
${body}
  </body>
</html>
`
  );
}

cpSync(resolve(root, 'manifest.json'), resolve(out, 'manifest.json'));
try {
  cpSync(resolve(root, 'icons'), resolve(out, 'icons'), { recursive: true });
} catch {
  // Icons are optional during development.
}

const common = {
  bundle: true,
  format: 'esm',
  target: 'chrome114',
  logLevel: 'info',
  // MV3 forbids remote code, and everything here is first-party anyway.
  external: []
};

const jobs = [
  { entryPoints: [resolve(root, 'src/popup.ts')], outfile: resolve(out, 'popup.js') },
  { entryPoints: [resolve(root, 'src/options.ts')], outfile: resolve(out, 'options.js') },
  // The content script is injected by chrome.scripting and must be a classic
  // script, not a module — executeScript does not support ESM.
  {
    entryPoints: [resolve(root, 'src/content.ts')],
    outfile: resolve(out, 'content.js'),
    format: 'iife'
  }
];

if (watch) {
  for (const job of jobs) {
    const ctx = await context({ ...common, ...job });
    await ctx.watch();
  }
  console.log('watching…');
} else {
  await Promise.all(jobs.map((job) => esbuild({ ...common, ...job })));
  console.log('extension built → dist/');
}
