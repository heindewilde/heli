const { colors, radius, typography } = require('./src/theme/tokens');

/**
 * Tailwind's theme, fed by the tokens generated from `src/app.css`.
 *
 * NativeWind has no cascade to resolve `var()` through, so a class has to
 * compile to a literal value — which means the palette is baked per theme
 * rather than swapped at runtime. Dark mode is therefore `dark:` variants over
 * a `darkMode: 'class'` root, not a custom-property swap like the web's
 * `[data-theme]`.
 *
 * Token names lose their leading `--` and their family prefix here, so
 * `--color-surface-2` is `bg-surface-2`, matching how it reads on the web.
 */
const strip = (obj, prefix) =>
  Object.fromEntries(
    Object.entries(obj)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => [k.slice(prefix.length), v])
  );

const light = colors.light;
const dark = colors.dark;

module.exports = {
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ...strip(light, '--color-'),
        stage: strip(light, '--stage-'),
        // The dark values are reachable as `dark-*` for the handful of places
        // that need both at once (a gradient, a static illustration). Ordinary
        // components use `dark:` variants.
        'on-dark': strip(dark, '--color-')
      },
      borderRadius: Object.fromEntries(
        Object.entries(radius).map(([k, v]) => [k, `${v}px`])
      ),
      fontSize: Object.fromEntries(
        Object.entries(typography).map(([k, v]) => [
          k,
          [`${v.fontSize}px`, { lineHeight: `${v.lineHeight ?? v.fontSize * 1.5}px` }]
        ])
      ),
      fontFamily: {
        // Geist Variable, loaded from the app's own static/fonts via expo-font.
        sans: ['Geist'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      }
    }
  },
  plugins: []
};
