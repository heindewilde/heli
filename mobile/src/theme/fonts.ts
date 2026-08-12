import { Platform } from 'react-native';

/**
 * Geist, the same face the web app uses.
 *
 * Four static instances rather than the variable font it is cut from. React
 * Native selects a face by *family name*, not by a weight axis, and its
 * behaviour with a variable font differs between iOS and Android — asking for
 * 600 can silently render 400 on one of them. Instantiating the four weights
 * the app asks for makes the choice unambiguous, and each is 88 KB.
 *
 * `mobile/scripts/fonts.mjs` regenerates them from `static/fonts/Geist-Variable.woff2`,
 * so the app and the web cannot end up on different cuts of the typeface.
 *
 * `fontWeight` is deliberately *not* set alongside these. Naming a weight while
 * also naming a pre-weighted family makes iOS synthesise a bolder face on top of
 * an already-bold one — the smeared look that says "web font in a native app".
 */
export const fonts = {
  'Geist-Regular': require('../../assets/fonts/Geist-Regular.ttf'),
  'Geist-Medium': require('../../assets/fonts/Geist-Medium.ttf'),
  'Geist-SemiBold': require('../../assets/fonts/Geist-SemiBold.ttf'),
  'Geist-Bold': require('../../assets/fonts/Geist-Bold.ttf')
};

export type Weight = '400' | '500' | '600' | '700';

const FAMILY: Record<Weight, string> = {
  '400': 'Geist-Regular',
  '500': 'Geist-Medium',
  '600': 'Geist-SemiBold',
  '700': 'Geist-Bold'
};

/**
 * The family to use for a weight, and nothing else.
 *
 * Returns `undefined` before the fonts finish loading so the system face shows
 * instead of nothing — a blank screen while a font downloads is the other
 * classic tell, and there is no reason for it when the fallback is SF Pro.
 */
export function fontFor(weight: Weight = '400', loaded = true): { fontFamily?: string } {
  if (!loaded) return {};
  return { fontFamily: FAMILY[weight] };
}

/** Tabular figures, so a clock or a total does not jiggle as digits change. */
export const TABULAR = Platform.select({
  ios: { fontVariant: ['tabular-nums' as const] },
  default: { fontVariant: ['tabular-nums' as const] }
});
