import { ActivityIndicator, View } from 'react-native';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { useTheme } from '../theme';
import { haptics } from './haptics';
import type { ReactNode } from 'react';

/**
 * Sizes are minimums, not paddings.
 *
 * 44pt is Apple's floor and 48dp is Google's; `md` clears both. A control that
 * measures 36pt because that is what looked right in a mockup is the single
 * most common way an app feels amateur in the hand — it works fine for whoever
 * built it and misses constantly for everyone else.
 */
const SIZES = {
  sm: { height: 36, padH: 12, variant: 'sm' as const },
  md: { height: 48, padH: 18, variant: 'base' as const },
  lg: { height: 54, padH: 22, variant: 'lg' as const }
};

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = {
  children: ReactNode;
  onPress?: () => void;
  variant?: Variant;
  size?: keyof typeof SIZES;
  disabled?: boolean;
  loading?: boolean;
  /** Fills the width. The default for anything at the bottom of a sheet. */
  block?: boolean;
  icon?: ReactNode;
  haptic?: 'none' | 'success' | 'tick';
};

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  block,
  icon,
  haptic = 'tick'
}: ButtonProps) {
  const t = useTheme();
  const s = SIZES[size];
  const inert = disabled || loading;

  const bg = {
    primary: t.c('--color-accent'),
    secondary: t.c('--color-surface-2'),
    ghost: 'transparent',
    danger: t.c('--color-danger')
  }[variant];

  const fg = {
    primary: '--color-accent-fg',
    secondary: '--color-text',
    ghost: '--color-interactive',
    danger: '--color-accent-fg'
  }[variant] as never;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      disabled={inert}
      press={variant === 'ghost' ? 'row' : 'button'}
      onPress={() => {
        if (inert) return;
        if (haptic === 'success') haptics.success();
        else if (haptic === 'tick') haptics.tick();
        onPress?.();
      }}
      style={{
        height: s.height,
        paddingHorizontal: s.padH,
        borderRadius: t.radius.md,
        backgroundColor: bg,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: t.c('--color-border'),
        alignSelf: block ? 'stretch' : 'flex-start',
        // A disabled control should read as unavailable, not broken. Dimming
        // the whole thing keeps its shape legible.
        opacity: inert ? 0.45 : 1
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={t.c(fg)} />
        ) : (
          <>
            {icon}
            <Text variant={s.variant} weight="600" tone={variantTone(variant)}>
              {children}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

function variantTone(v: Variant) {
  if (v === 'primary' || v === 'danger') return 'inverse' as const;
  if (v === 'ghost') return 'accent' as const;
  return 'default' as const;
}
