import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing
} from 'react-native-reanimated';
import { useTheme } from '../theme';

/**
 * A placeholder shaped like what replaces it.
 *
 * The rule from the web carries over exactly: size it to match, so nothing
 * jumps when the real content lands. A skeleton that is the wrong height is
 * worse than a spinner, because it promises a layout and then breaks it.
 *
 * The pulse is opacity on the UI thread, and slow — 1.1s, eased both ways.
 * Fast shimmer reads as urgency; this should read as "nearly there". It also
 * stops entirely under reduced-motion, which on a phone is a setting people
 * genuinely use.
 */

export function Skeleton({
  width,
  height = 14,
  radius,
  style
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 550, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.5, { duration: 550, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius ?? t.radius.sm,
          backgroundColor: t.c('--color-surface-2')
        },
        style,
        animated
      ]}
    />
  );
}

/** A stand-in for one list row, matching `PersonRow`'s metrics exactly. */
export function SkeletonRow() {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: t.c('--color-surface')
      }}
    >
      <Skeleton width={40} height={40} radius={20} />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton width="55%" height={15} />
        <Skeleton width="35%" height={12} />
      </View>
    </View>
  );
}
