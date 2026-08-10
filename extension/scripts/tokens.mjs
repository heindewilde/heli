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

function block(css, selector) {
  const at = css.indexOf(selector);
  if (at === -1) return '';
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function vars(body) {
  return [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .filter(([, name]) => WANTED.test(name))
    .map(([, name, value]) => `  ${name}: ${value.trim()};`)
    .join('\n');
}

export function extractTokens(appCssPath) {
  const css = readFileSync(appCssPath, 'utf8');
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
