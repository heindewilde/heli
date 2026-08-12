import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { colors, radius, typography, duration, easing, type ThemeName } from './tokens';
import { elevationFor } from './elevation';

/**
 * The theme, resolved once and read everywhere.
 *
 * `useColorScheme()` rather than a stored preference: on a phone the system
 * setting is the answer, it changes on a schedule people have already chosen,
 * and an in-app override is a setting nobody visits. The web needs its own
 * toggle because a browser tab has no such signal to follow.
 *
 * Colours come back with their token names intact — `c('--color-surface')` —
 * so a value here reads the same as it does in `app.css` and in a Svelte
 * component. Two spellings of the same palette is how they drift.
 */

type Theme = {
  name: ThemeName;
  /** Resolve a colour token. Misspelling one is a compile error. */
  c: (token: keyof typeof colors.light) => string;
  radius: typeof radius;
  type: typeof typography;
  duration: typeof duration;
  easing: typeof easing;
  elevation: (role: 'panel' | 'raised' | 'overlay') => ReturnType<typeof elevationFor>;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const name: ThemeName = scheme === 'dark' ? 'dark' : 'light';

  const value = useMemo<Theme>(() => {
    const palette = colors[name];
    return {
      name,
      c: (token) => palette[token],
      radius,
      type: typography,
      duration,
      easing,
      elevation: (role) => elevationFor(role, name)
    };
  }, [name]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

export type { Theme, ThemeName };
