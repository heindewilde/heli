import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useTheme } from '../theme';
import { Text } from './Text';
import { haptics } from './haptics';

/**
 * A row you can swipe.
 *
 * This is the interaction that most says "native app" rather than "website in a
 * shell" — and it is also the one most often built badly. Three details do the
 * work:
 *
 * **The action is revealed, not slid over.** The coloured panel sits behind the
 * row and is uncovered as it moves, so the gesture reads as pulling a curtain
 * rather than dragging a card around.
 *
 * **It commits past a threshold, and tells you with a haptic *at* the
 * threshold** — not on release. That is what lets someone swipe confidently
 * without watching: the phone confirms the action is armed while the finger is
 * still down.
 *
 * **`activeOffsetX` is set.** Without it the pan competes with the vertical
 * scroll and the list feels sticky. Requiring ~12pt of horizontal movement
 * before claiming the gesture is the difference between a list that scrolls and
 * one that fights back.
 */

const THRESHOLD = 96;
const MAX = 128;

export type SwipeAction = {
  label: string;
  /** Token name, resolved against the theme. */
  color: '--color-danger' | '--color-success' | '--color-warning' | '--color-interactive';
  icon?: ReactNode;
  onAction: () => void;
};

export function SwipeRow({
  children,
  right,
  enabled = true
}: {
  children: ReactNode;
  right?: SwipeAction;
  enabled?: boolean;
}) {
  const t = useTheme();
  const x = useSharedValue(0);
  const armed = useSharedValue(false);
  const fired = useRef(false);

  const buzz = () => haptics.tick();
  const run = () => {
    if (fired.current) return;
    fired.current = true;
    right?.onAction();
    // Let the row settle before allowing another. Without this a fast
    // double-swipe fires twice on a row that is already gone.
    setTimeout(() => (fired.current = false), 400);
  };

  const pan = Gesture.Pan()
    // Claim the gesture only once it is clearly horizontal, and only leftward.
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .enabled(enabled && !!right)
    .onUpdate((e) => {
      if (e.translationX > 0) {
        x.value = 0;
        return;
      }
      // Rubber-banding past the max: it keeps moving, but grudgingly, so the
      // edge is felt rather than hit.
      const raw = -e.translationX;
      x.value = -(raw > MAX ? MAX + (raw - MAX) * 0.15 : raw);

      const nowArmed = raw >= THRESHOLD;
      if (nowArmed !== armed.value) {
        armed.value = nowArmed;
        runOnJS(buzz)();
      }
    })
    .onEnd(() => {
      if (armed.value) runOnJS(run)();
      armed.value = false;
      x.value = withSpring(0, { damping: 20, stiffness: 300, mass: 0.6 });
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  // The label slides slightly less than the row, so it settles into place
  // rather than being dragged — a small parallax that reads as depth.
  const labelStyle = useAnimatedStyle(() => ({
    opacity: withTiming(-x.value > 24 ? 1 : 0, { duration: 120 }),
    transform: [{ translateX: Math.min(0, (x.value + THRESHOLD) * 0.25) }]
  }));

  if (!right) return <>{children}</>;

  return (
    <View>
      <View
        style={{
          ...StyleSheetAbsoluteFill,
          backgroundColor: t.c(right.color),
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingRight: 24
        }}
      >
        <Animated.View style={[{ alignItems: 'center', gap: 3 }, labelStyle]}>
          {right.icon}
          <Text variant="2xs" weight="600" tone="inverse">
            {right.label}
          </Text>
        </Animated.View>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0
};
