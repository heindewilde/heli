import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../theme';
import type { colors } from '../theme/tokens';

/**
 * Every piece of text in the app goes through here.
 *
 * Two reasons, both about feeling native rather than looking tidy.
 *
 * **Dynamic Type.** `allowFontScaling` is on, and the scale steps come from
 * `app.css` so they match the web — but a phone lets people choose their text
 * size, and an app that ignores it is instantly identifiable as a port. Sizes
 * are capped rather than uncapped: at the accessibility sizes an uncapped list
 * row becomes three lines of truncation, which helps nobody.
 *
 * **One place for colour.** A `<Text>` with no explicit colour inherits black
 * on iOS and dark grey on Android, which is exactly the bug that makes a dark
 * theme look half-finished.
 */

type Variant = keyof ReturnType<typeof useTheme>['type'];
type Tone = 'default' | 'muted' | 'subtle' | 'danger' | 'accent' | 'inverse';

const TONE_TOKEN: Record<Tone, keyof typeof colors.light> = {
  default: '--color-text',
  muted: '--color-muted',
  subtle: '--color-subtle',
  danger: '--color-danger',
  accent: '--color-interactive',
  inverse: '--color-accent-fg'
};

export type TextProps = RNTextProps & {
  variant?: Variant;
  tone?: Tone;
  weight?: '400' | '500' | '600' | '700';
  /** Digits that don't jiggle. On by default for anything read as a number. */
  tabular?: boolean;
};

export function Text({
  variant = 'base',
  tone = 'default',
  weight,
  tabular,
  style,
  ...rest
}: TextProps) {
  const t = useTheme();
  const step = t.type[variant];

  return (
    <RNText
      allowFontScaling
      // Beyond about 1.4× the layout stops being a layout. Capping is the
      // honest trade: still respects the setting, still legible, still a list.
      maxFontSizeMultiplier={1.4}
      style={[
        {
          fontSize: step.fontSize,
          lineHeight: 'lineHeight' in step ? step.lineHeight : undefined,
          letterSpacing: 'letterSpacing' in step ? step.letterSpacing : undefined,
          color: t.c(TONE_TOKEN[tone]),
          fontWeight: weight,
          fontVariant: tabular ? ['tabular-nums'] : undefined
        },
        style
      ]}
      {...rest}
    />
  );
}
