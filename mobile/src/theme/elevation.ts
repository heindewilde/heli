import { Platform } from 'react-native';

/**
 * The one part of the design system that is hand-written rather than generated.
 *
 * `src/app.css` describes shadows as stacked layers — `--shadow-panel` is a
 * hairline, a soft ambient spread, and an inset 1px ring, in one declaration.
 * React Native has no equivalent: iOS exposes a single `shadowColor/Offset/
 * Opacity/Radius`, Android exposes a single `elevation` integer that also
 * controls z-ordering, and neither can do an inset. Generating something from
 * the CSS would mean silently picking one layer and dropping the rest.
 *
 * So these are approximations, chosen by eye, against the same three *role*
 * names the web uses — and `mobile/scripts/tokens.mjs` throws if app.css grows
 * a fourth role that is not implemented here. A build failure is the right
 * outcome: a missing shadow is invisible in code review and looks like a
 * deliberate flat style in the app.
 *
 * The inset ring becomes a real border at the call site, because that is what
 * it is: `Card` draws `borderWidth: 1` with `--color-border`.
 */

type Elevation = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

function make(ios: Omit<Elevation, 'elevation'>, android: number): Elevation {
  return { ...ios, elevation: android };
}

/** A resting surface: list rows, cards, the sheet's own body. */
export const panel = make(
  { shadowColor: '#0f0f14', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
  1
);

/** Something lifted off the page: a floating action, an active drag. */
export const raised = make(
  { shadowColor: '#0f0f14', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10 },
  4
);

/** Above everything: bottom sheets, menus, toasts. */
export const overlay = make(
  { shadowColor: '#0f0f14', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 24 },
  12
);

export const elevation = { panel, raised, overlay };
export type ElevationRole = keyof typeof elevation;

/**
 * Dark mode needs more than a darker shadow — on a near-black surface an
 * ambient shadow is invisible, and the web palette solves it the same way, by
 * leaning on the inset ring instead. Callers pair this with a border.
 */
export function elevationFor(role: ElevationRole, theme: 'light' | 'dark'): Elevation {
  const base = elevation[role];
  if (theme === 'light') return base;
  return {
    ...base,
    shadowColor: '#000000',
    shadowOpacity: Platform.OS === 'ios' ? base.shadowOpacity * 2.2 : base.shadowOpacity
  };
}
