import { context, build as esbuild } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTokens } from './tokens.mjs';
import { decodePng, encodePng, resize } from './resize.mjs';

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

   The sizes Chrome actually needs are 16 and 32 (the toolbar action), 48 (the
   extensions page) and 128 (the install dialog and the Web Store). static/ has
   none of them, so they are generated from the 512 source — see resize.mjs for
   why that is a hundred lines rather than a dependency. Every declared size in
   manifest.json is a real file at exactly that size; a mismatched key renders
   blurry. */
const ICON_SOURCE = resolve(repo, 'static/web-app-manifest-512x512.png');
const ICON_SIZES = [16, 32, 48, 128, 512];

mkdirSync(resolve(out, 'icons'), { recursive: true });
let source;
try {
  source = decodePng(readFileSync(ICON_SOURCE));
} catch (err) {
  // The previous version swallowed a missing icon entirely; failing loudly is
  // right, but a bare ENOENT from deep in cpSync gives no clue that the app's
  // static/ directory is the culprit.
  throw new Error(`Could not read the app icon at ${ICON_SOURCE}: ${err.message}`);
}
for (const size of ICON_SIZES) {
  const image = size === source.width ? source : resize(source, size);
  writeFileSync(resolve(out, 'icons', `icon${size}.png`), encodePng(image));
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
