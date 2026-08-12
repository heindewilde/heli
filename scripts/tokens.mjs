import { readFileSync } from 'node:fs';

/**
 * Lift the design tokens out of the app's `src/app.css` so nothing that is not
 * the web app can drift from Heli's palette.
 *
 * This is the alternative to giving each satellite build its own Tailwind
 * pipeline: they need a few dozen custom properties, not a build system.
 * Reading them from the source of truth means a theme change in the app reaches
 * every consumer on its next build, and a colour that gets renamed shows up as
 * a missing variable rather than as a subtly wrong shade.
 *
 * Two consumers, wanting different things out of the same parse:
 *
 *   - `extension/scripts/tokens.mjs` re-exports `extractTokens`, which emits
 *     CSS. A browser popup has a cascade, so `var()` is all it needs.
 *   - `mobile/scripts/tokens.mjs` uses `parseTokens`, because React Native has
 *     no cascade and no custom properties — it needs the resolved values for
 *     both themes as data, and it has to convert several of them (see that
 *     file). Emitting CSS for it would be emitting something it cannot read.
 *
 * The parser lives here rather than in `extension/` so `mobile/` does not have
 * to reach into a sibling build artifact to get it.
 */

/** What `extractTokens` ships to the extension. `parseTokens` filters nothing. */
const CSS_WANTED = /^--(?:color|radius|shadow)-/;

/**
 * Strip comments before anything else.
 *
 * Prose is allowed to contain braces and selector text, and app.css is heavily
 * commented — a sentence mentioning this very parser was enough to break it.
 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

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
 * So: skip matches that turn out to be part of a declaration (a `;` arrives
 * before any `{`), and brace-count to the true close.
 */
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

function declarations(body) {
  const out = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

/**
 * Every custom property in both themes, as data.
 *
 * The dark block only *overrides*; it is not a complete palette. Callers that
 * need a full dark theme should spread light first — `mobile/scripts/tokens.mjs`
 * does, and asserts the result covers every light key.
 *
 * @returns {{ light: Record<string,string>, dark: Record<string,string> }}
 */
export function parseTokens(appCssPath) {
  const css = stripComments(readFileSync(appCssPath, 'utf8'));
  const light = declarations(block(css, '@theme'));
  // The single-quoted spelling. app.css uses double quotes in the
  // `@custom-variant` line specifically so the two cannot be confused, and
  // there is a comment there saying so — keep them in step.
  const dark = declarations(block(css, "[data-theme='dark']"));
  if (Object.keys(light).length === 0) {
    throw new Error('tokens: no @theme block found in app.css');
  }
  return { light, dark };
}

/** The extension's CSS form: `:root` plus a `prefers-color-scheme` override. */
export function extractTokens(appCssPath) {
  const { light, dark } = parseTokens(appCssPath);
  const emit = (obj, indent) =>
    Object.entries(obj)
      .filter(([name]) => CSS_WANTED.test(name))
      .map(([name, value]) => `${indent}${name}: ${value};`)
      .join('\n');

  return `/* Generated from src/app.css by scripts/tokens.mjs — do not edit. */
:root {
${emit(light, '  ')}
}

@media (prefers-color-scheme: dark) {
  :root {
${emit(dark, '    ')}
  }
}
`;
}
