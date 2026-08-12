import { useCallback } from 'react';
import { Pressable as RNPressable, type PressableProps, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { haptics } from './haptics';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * The press interaction the whole app is built on.
 *
 * A web app signals "pressable" with hover and a cursor. A phone has neither,
 * so the only thing that makes a control feel alive is how it responds to the
 * finger — and the default `opacity: 0.2` on `TouchableOpacity` reads as
 * something switching off rather than being pressed.
 *
 * So: a small scale-down on a spring, driven on the UI thread by Reanimated so
 * it never stutters behind a JS render. The numbers are deliberately subtle —
 * 2% at most, and less on large surfaces, because a whole list row shrinking
 * 5% looks like a bug rather than a button.
 *
 * `hitSlop` defaults to the difference between a comfortable target and the 44pt
 * minimum, so small icon buttons stay reachable without drawing padding nobody
 * can see.
 */

export type AppPressableProps = PressableProps & {
  /** How much to shrink. `row` barely moves; `button` is a real press. */
  press?: 'button' | 'row' | 'none';
  /** Fire a selection tick on press-in. For controls that change a value. */
  haptic?: boolean;
  style?: ViewStyle;
};

const SCALE = { button: 0.97, row: 0.99, none: 1 };

export function Pressable({
  press = 'button',
  haptic = false,
  onPressIn,
  onPressOut,
  style,
  children,
  ...rest
}: AppPressableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value
  }));

  const handleIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (e) => {
      // Down is instant; nobody perceives a spring on the way in, and easing it
      // makes a quick tap feel like it was missed.
      scale.value = withTiming(SCALE[press], { duration: 60 });
      opacity.value = withTiming(press === 'none' ? 1 : 0.9, { duration: 60 });
      if (haptic) haptics.selection();
      onPressIn?.(e);
    },
    [press, haptic, onPressIn, scale, opacity]
  );

  const handleOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (e) => {
      // Up springs back. A little overshoot is what reads as "physical".
      scale.value = withSpring(1, { damping: 15, stiffness: 400, mass: 0.5 });
      opacity.value = withTiming(1, { duration: 120 });
      onPressOut?.(e);
    },
    [onPressOut, scale, opacity]
  );

  return (
    <AnimatedPressable
      onPressIn={handleIn}
      onPressOut={handleOut}
      hitSlop={8}
      style={[style, animated]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
