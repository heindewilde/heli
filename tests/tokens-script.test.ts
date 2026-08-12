import { describe, expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
// @ts-expect-error — plain .mjs with no type declarations, by design.
import { parseTokens, extractTokens } from '../scripts/tokens.mjs';

/**
 * `scripts/tokens.mjs` is the single parse behind the extension's `tokens.css`
 * and the mobile app's theme object. It had no coverage at all while it was
 * extension-only, which was survivable because a wrong popup colour is visible.
 * With a second consumer that cannot use `var()` — React Native has no cascade —
 * the parse became load-bearing, and every failure mode it guards against is
 * silent: a truncated palette, or the light values shipped as the dark theme.
 */

const APP_CSS = resolve(fileURLToPath(new URL('.', import.meta.url)), '../src/app.css');

describe('parseTokens', () => {
  test('reads both themes out of app.css', () => {
    const { light, dark } = parseTokens(APP_CSS);
    expect(Object.keys(light).length).toBeGreaterThan(80);
    expect(Object.keys(dark).length).toBeGreaterThan(50);
  });

  test('every family the app defines survives the parse', () => {
    const { light } = parseTokens(APP_CSS);
    const families = new Set(
      Object.keys(light)
        .map((k) => /^--([a-z]+)-/.exec(k)?.[1])
        .filter(Boolean)
    );
    // If the brace counter regressed to `indexOf('}')` it would truncate
    // part-way through `@theme` and quietly drop whichever families come last.
    for (const f of ['color', 'stage', 'radius', 'shadow', 'text', 'duration', 'ease', 'z']) {
      expect(families).toContain(f);
    }
  });

  test('the dark block is the dark block, not @theme read twice', () => {
    const { light, dark } = parseTokens(APP_CSS);
    // The bug this guards: `@custom-variant dark (&:where([data-theme="dark"]…));`
    // sits above the real rule, and matching it made the parser read the *next*
    // block — `@theme` — so the light palette shipped as the dark theme.
    expect(dark['--color-bg']).not.toBe(light['--color-bg']);
    expect(dark['--color-text']).not.toBe(light['--color-text']);
  });

  test('every themed token has a dark value', () => {
    const { light, dark } = parseTokens(APP_CSS);
    // A colour or stage hue defined only in light renders wrong in dark mode —
    // and on mobile there is no cascade to fall back through, so it would
    // resolve to undefined rather than merely to the light shade.
    const missing = Object.keys(light)
      .filter((k) => /^--(color|stage)-/.test(k))
      .filter((k) => !(k in dark));
    expect(missing).toEqual([]);
  });

  test('a palette that cannot be found is a build failure, not an empty file', () => {
    expect(() => parseTokens(resolve(APP_CSS, '../app.html'))).toThrow(/no @theme block/);
  });
});

describe('extractTokens (the extension form)', () => {
  test('emits :root plus a prefers-color-scheme override', () => {
    const css = extractTokens(APP_CSS);
    expect(css).toContain(':root {');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain('--color-bg:');
  });

  test('ships only the families the popup needs', () => {
    const css = extractTokens(APP_CSS);
    // Narrower than parseTokens on purpose — the popup is a small surface and
    // has no use for the type scale or the motion tokens.
    expect(css).not.toContain('--text-xs:');
    expect(css).not.toContain('--duration-fast:');
  });
});

describe('values the mobile emitter has to convert', () => {
  // These are assertions about app.css itself, kept here because they are the
  // reason mobile/scripts/tokens.mjs exists rather than reusing extractTokens.
  test('space-separated rgb() is present, and React Native cannot parse it', () => {
    const { light } = parseTokens(APP_CSS);
    expect(light['--color-interactive-ring']).toMatch(/^rgb\(\d+ \d+ \d+ \/ [\d.]+\)$/);
    expect(light['--color-row-hover']).toMatch(/^rgb\(/);
  });

  test('stage hues are space-separated hsl()', () => {
    const { light } = parseTokens(APP_CSS);
    expect(light['--stage-sky-swatch']).toMatch(/^hsl\(\d+ [\d.]+% [\d.]+%\)$/);
  });

  test('the type scale is not Tailwind default', () => {
    const { light } = parseTokens(APP_CSS);
    // 13px and 15px. Anything that hardcodes Tailwind's 12/14 is wrong here,
    // which is exactly why the mobile scale is generated rather than written.
    expect(light['--text-xs']).toBe('0.8125rem');
    expect(light['--text-sm']).toBe('0.9375rem');
  });

  test('shadows are multi-layer, which RN has no way to express', () => {
    const { light } = parseTokens(APP_CSS);
    // Hence mobile/src/theme/elevation.ts is hand-written against the three
    // role names, and the emitter throws if a role appears that it does not
    // name. Pinning the shape here so that decision stays justified.
    expect(light['--shadow-panel'].split(',').length).toBeGreaterThan(2);
  });
});
