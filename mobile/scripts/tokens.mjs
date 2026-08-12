import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTokens } from '../../scripts/tokens.mjs';

/**
 * Turn `src/app.css` into a React Native theme.
 *
 * The extension gets CSS out of the same parse and is done, because a browser
 * popup has a cascade: `var(--color-bg)` resolves itself, and a
 * `prefers-color-scheme` block is a complete dark mode in three lines. React
 * Native has none of that. It has no custom properties, no cascade, and no
 * media queries — so the values have to arrive as data, for both themes, in
 * forms RN's style parser actually accepts.
 *
 * That last clause is most of this file. Three of app.css's value syntaxes are
 * valid modern CSS that RN rejects outright, and one of them (`rgb(r g b / a)`)
 * fails by rendering nothing rather than by throwing.
 *
 * Generated output is gitignored and rebuilt by `npm run tokens`, which
 * `prestart` and `typecheck` both run — the same posture as `extension/dist/`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_CSS = resolve(HERE, '../../src/app.css');
const OUT = resolve(HERE, '../src/theme/tokens.ts');

/** Scale tokens. The role-named shadows are handled separately — see below. */
const SHADOW_SCALE = new Set(['xs', 'sm', 'md', 'lg', 'ring']);

/**
 * The shadow roles `src/theme/elevation.ts` hand-writes.
 *
 * Shadows are the one family that cannot be generated. `--shadow-panel` is
 * three stacked layers including an inset ring; RN's `shadow*`/`elevation`
 * props express exactly one, and iOS and Android disagree about even that. So
 * elevation.ts is written by hand against these role names, and this script
 * *fails the build* if app.css grows a role it does not cover — the same
 * fail-loud stance as `parseTokens` throwing on a missing `@theme`. Silently
 * emitting nothing would ship a flat app that looks like a design decision.
 */
const KNOWN_SHADOW_ROLES = new Set(['panel', 'raised', 'overlay']);

/* ── value conversions ───────────────────────────────────────────────────── */

/**
 * `rgb(37 99 235 / 0.40)` → `rgba(37, 99, 235, 0.4)`.
 *
 * The space-separated form is CSS Color 4 and is what app.css uses for
 * `--color-interactive-ring` and `--color-row-hover`. RN's parser does not
 * accept it, and the failure mode is the worst kind: the style is dropped and
 * the element renders with no colour at all rather than erroring.
 */
function convertRgb(value) {
  return value.replace(
    /rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)/g,
    (_, r, g, b, a) => {
      if (a === undefined) return `rgb(${r}, ${g}, ${b})`;
      const alpha = a.endsWith('%') ? Number.parseFloat(a) / 100 : Number.parseFloat(a);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  );
}

/**
 * `hsl(200 35% 58%)` → `#7ba3bd`.
 *
 * All 24 `--stage-*` values are space-separated HSL. RN accepts the comma form,
 * but converting to hex removes the question entirely and makes the emitted
 * theme readable when someone is eyeballing a colour.
 */
function hslToHex(h, s, l) {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (n) =>
    Math.round(255 * f(n))
      .toString(16)
      .padStart(2, '0');
  return `#${hex(0)}${hex(8)}${hex(4)}`;
}

function convertHsl(value) {
  return value.replace(
    /hsla?\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*(?:\/\s*([\d.]+)\s*)?\)/g,
    (_, h, s, l, a) => {
      const hex = hslToHex(Number(h), Number(s), Number(l));
      // An alpha on a stage colour would have to stay functional; none exist
      // today, and guessing is worse than being told.
      if (a !== undefined) throw new Error(`tokens: hsl() with alpha is not converted: ${value}`);
      return hex;
    }
  );
}

function color(value) {
  const v = convertHsl(convertRgb(value.trim()));
  if (/\bhsl|\brgb\(\s*[\d.]+\s+/.test(v)) {
    throw new Error(`tokens: unconverted colour syntax React Native cannot parse: ${value}`);
  }
  return v;
}

/** `0.5rem` → 8. RN sizes are unitless numbers of density-independent pixels. */
function rem(value) {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) throw new Error(`tokens: not a length: ${value}`);
  return value.includes('rem') ? Math.round(n * 16 * 1000) / 1000 : n;
}

function ms(value) {
  return Number.parseFloat(value);
}

/** `cubic-bezier(0.22, 1, 0.36, 1)` → `[0.22, 1, 0.36, 1]` for Easing.bezier. */
function bezier(value) {
  const nums = value.match(/-?[\d.]+/g);
  if (!nums || nums.length !== 4) throw new Error(`tokens: not a cubic-bezier: ${value}`);
  return nums.map(Number);
}

/* ── build ───────────────────────────────────────────────────────────────── */

const { light, dark } = parseTokens(APP_CSS);

// The dark block only *overrides*. A complete dark theme is light with those
// applied on top — and every themed token must be present in both, which
// `tests/tokens-script.test.ts` asserts against app.css directly.
const darkFull = { ...light, ...dark };

function colorsFrom(src) {
  const out = {};
  for (const [name, value] of Object.entries(src)) {
    if (name.startsWith('--color-') || name.startsWith('--stage-')) out[name] = color(value);
  }
  return out;
}

const radius = {};
const z = {};
const duration = {};
const easing = {};
const typography = {};
const shadowRoles = [];

for (const [name, value] of Object.entries(light)) {
  if (name.startsWith('--radius-')) radius[name.slice('--radius-'.length)] = rem(value);
  else if (name.startsWith('--z-')) z[name.slice('--z-'.length)] = Number(value);
  else if (name.startsWith('--duration-')) duration[name.slice('--duration-'.length)] = ms(value);
  else if (name.startsWith('--ease-')) easing[name.slice('--ease-'.length)] = bezier(value);
  else if (name.startsWith('--shadow-')) {
    const role = name.slice('--shadow-'.length);
    if (!SHADOW_SCALE.has(role)) shadowRoles.push(role);
  } else if (name.startsWith('--text-') && !name.includes('--line-height') && !name.includes('--letter-spacing')) {
    const key = name.slice('--text-'.length);
    const entry = { fontSize: rem(value) };
    const lh = light[`--text-${key}--line-height`];
    if (lh) entry.lineHeight = rem(lh);
    const ls = light[`--text-${key}--letter-spacing`];
    // `em` is relative to the font size, which RN has no concept of — resolve
    // it against this step's own size so the tracking survives.
    if (ls) entry.letterSpacing = Math.round(Number.parseFloat(ls) * entry.fontSize * 1000) / 1000;
    typography[key] = entry;
  }
}

const unknownRoles = shadowRoles.filter((r) => !KNOWN_SHADOW_ROLES.has(r));
if (unknownRoles.length > 0) {
  throw new Error(
    `tokens: app.css defines shadow role(s) [${unknownRoles.join(', ')}] that ` +
      `mobile/src/theme/elevation.ts does not implement. RN cannot express a ` +
      `multi-layer shadow, so these are hand-written — add the role there, then ` +
      `add it to KNOWN_SHADOW_ROLES here.`
  );
}

const lightColors = colorsFrom(light);
const darkColors = colorsFrom(darkFull);

const j = (v) => JSON.stringify(v, null, 2).replace(/\n/g, '\n');

const source = `/**
 * Generated from src/app.css by mobile/scripts/tokens.mjs — do not edit.
 *
 * Regenerate with \`npm run tokens\` (which \`prestart\` and \`typecheck\` run).
 * Colours are converted to forms React Native accepts: space-separated
 * \`rgb(r g b / a)\` becomes \`rgba()\`, and \`hsl()\` becomes hex.
 *
 * Shadows are deliberately absent — see src/theme/elevation.ts.
 */

export const colors = {
  light: ${j(lightColors)},
  dark: ${j(darkColors)}
} as const;

/** Every colour token name, so a rename in app.css becomes a compile error here. */
export type ColorToken = keyof typeof colors.light;

export const radius = ${j(radius)} as const;
export const zIndex = ${j(z)} as const;
export const duration = ${j(duration)} as const;
export const easing = ${j(easing)} as const;

/**
 * The type scale, resolved to numbers.
 *
 * Note these are NOT Tailwind's defaults — app.css redefines \`xs\` to 13px and
 * \`sm\` to 15px. Generating them is the only way that stays true.
 */
export const typography = ${j(typography)} as const;

export type ThemeName = 'light' | 'dark';
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, source);

console.log(
  `tokens: ${Object.keys(lightColors).length} colours × 2 themes, ` +
    `${Object.keys(typography).length} type steps → src/theme/tokens.ts`
);
