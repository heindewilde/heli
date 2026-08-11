import { readFileSync } from 'node:fs';

/**
 * Lift the colour tokens out of the app's `src/app.css` so the popup cannot
 * drift from Heli's palette.
 *
 * This is the alternative to giving the extension its own Tailwind pipeline: it
 * needs about twenty custom properties, not a build system. Reading them from
 * the source of truth means a theme change in the app reaches the popup on the
 * next extension build, and a colour that gets renamed shows up as a missing
 * variable rather than as a subtly wrong shade.
 */

const WANTED = /^--(?:color|radius|shadow)-/;

/**
 * Slice out the body of the first *block* whose header contains `selector`.
 *
 * This used to be `indexOf('{')` then `indexOf('}')`, which had two silent
 * failure modes, and silent is the operative word — a wrong palette looks like
 * a design decision, not like a broken build.
 *
 *  1. The first `}` is not the matching one as soon as the block contains a
 *     nested rule. It would truncate the palette mid-way and export whatever
 *     it had got to.
 *  2. `indexOf(selector)` matched the selector text wherever it appeared,
 *     including inside a declaration. `@custom-variant dark (&:where([data-theme='dark']…));`
 *     sits above the real block in app.css, so the dark palette would have been
 *     read starting from the *next* `{` — which is `@theme`'s. The extension
 *     would have shipped the light palette as its dark theme.
 *
 * So: strip comments first (prose is allowed to contain braces and selector
 * text, and app.css is heavily commented — a sentence mentioning this very
 * parser was enough to break it), skip matches that turn out to be part of a
 * declaration (a `;` arrives before any `{`), and brace-count to the true
 * close.
 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function block(css, selector) {
  let from = 0;
  for (;;) {
    const at = css.indexOf(selector, from);
    if (at === -1) return '';
    const open = css.indexOf('{', at);
    if (open === -1) return '';

    const semi = css.indexOf(';', at);
    if (semi !== -1 && semi < open) {
      from = at + selector.length;
      continue;
    }

    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
    }
    return css.slice(open + 1);
  }
}

function vars(body) {
  return [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .filter(([, name]) => WANTED.test(name))
    .map(([, name, value]) => `  ${name}: ${value.trim()};`)
    .join('\n');
}

export function extractTokens(appCssPath) {
  const css = stripComments(readFileSync(appCssPath, 'utf8'));
  const light = vars(block(css, '@theme'));
  const dark = vars(block(css, "[data-theme='dark']"));
  if (!light) throw new Error('tokens: no @theme block found in app.css');
  return `/* Generated from src/app.css by scripts/tokens.mjs — do not edit. */
:root {
${light}
}

@media (prefers-color-scheme: dark) {
  :root {
${dark
  .split('\n')
  .map((l) => (l ? `  ${l}` : l))
  .join('\n')}
  }
}
`;
}
