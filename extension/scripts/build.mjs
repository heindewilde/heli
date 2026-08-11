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

/* Icons come from the app's own static/ directory rather than a second copy
   living here — same reasoning as tokens.css above. A rebranding then reaches
   the extension on the next build instead of leaving it showing the old mark.

   The sizes declared in manifest.json must match these files' real pixel
   dimensions; Chrome scales from the nearest, and a mismatched key renders
   blurry. There is no exact 128, so 96/192/512 are declared and Chrome picks. */
const ICONS = {
  'icon96.png': 'favicon-96x96.png',
  'icon192.png': 'web-app-manifest-192x192.png',
  'icon512.png': 'web-app-manifest-512x512.png'
};
mkdirSync(resolve(out, 'icons'), { recursive: true });
for (const [dest, src] of Object.entries(ICONS)) {
  cpSync(resolve(repo, 'static', src), resolve(out, 'icons', dest));
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
