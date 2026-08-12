import { useRef, type ReactNode } from 'react';
import { Animated, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { useTheme } from '../theme';

/**
 * A screen with a title that behaves the way the platform's does.
 *
 * iOS large titles are not decoration — they are how someone knows which screen
 * they are on while their thumb is nowhere near the top. The real behaviour has
 * three parts, and skipping any one of them is what makes a reimplementation
 * feel off:
 *
 *   1. the large title scrolls away with the content, not on a threshold;
 *   2. a compact title fades in as it goes, so the screen is never unlabelled;
 *   3. a hairline appears under the bar only once content is behind it.
 *
 * Driven by `Animated` with `useNativeDriver`, so it tracks the finger exactly
 * rather than arriving a frame late — the tell that separates this from a
 * scroll listener in JS.
 */
export function Screen({
  title,
  action,
  children,
  scrollY
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  /** The list's scroll position. Omit for a static screen. */
  scrollY?: Animated.Value;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const fallback = useRef(new Animated.Value(0)).current;
  const y = scrollY ?? fallback;

  const compactOpacity = y.interpolate({
    inputRange: [12, 40],
    outputRange: [0, 1],
    extrapolate: 'clamp'
  });
  const borderOpacity = y.interpolate({
    inputRange: [0, 12],
    outputRange: [0, 1],
    extrapolate: 'clamp'
  });
  const largeOpacity = y.interpolate({
    inputRange: [0, 36],
    outputRange: [1, 0],
    extrapolate: 'clamp'
  });
  const largeShift = y.interpolate({
    inputRange: [0, 60],
    outputRange: [0, -12],
    extrapolate: 'clamp'
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.c('--color-bg') }}>
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: t.c('--color-bg'),
          zIndex: 10
        }}
      >
        <View
          style={{
            height: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 16
          }}
        >
          <Animated.View style={{ opacity: compactOpacity }}>
            <Text variant="base" weight="600">
              {title}
            </Text>
          </Animated.View>
          {action ? (
            <View style={{ position: 'absolute', right: 12 }}>{action}</View>
          ) : null}
        </View>

        <Animated.View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 6,
            opacity: largeOpacity,
            transform: [{ translateY: largeShift }]
          }}
        >
          <Text
            variant="3xl"
            weight="700"
            // The large title is the one place text should not grow without
            // bound: past ~1.2× it wraps to three lines and pushes the list off
            // screen, and the compact title already covers that need.
            maxFontSizeMultiplier={1.2}
          >
            {title}
          </Text>
        </Animated.View>

        <Animated.View
          style={{
            height: Platform.OS === 'ios' ? 0.5 : 1,
            backgroundColor: t.c('--color-border'),
            opacity: borderOpacity
          }}
        />
      </View>

      {children}
    </View>
  );
}
