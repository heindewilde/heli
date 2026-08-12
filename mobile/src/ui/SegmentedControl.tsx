import { useRef } from 'react';
import { Animated, LayoutAnimation, Platform, View, UIManager } from 'react-native';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { useTheme } from '../theme';
import { haptics } from './haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Two or three mutually exclusive views.
 *
 * The thumb slides rather than jumping, which is the entire difference between
 * this and two buttons. A native segmented control animates the selection
 * between positions so the eye follows it; swapping a background colour makes
 * the same control feel like a web radio group.
 *
 * The slide is `Animated` with `useNativeDriver`, so it stays smooth while the
 * list underneath is re-querying SQLite.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange
}: {
  segments: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const t = useTheme();
  const index = Math.max(0, segments.findIndex((s) => s.value === value));
  const slide = useRef(new Animated.Value(index)).current;
  const width = useRef(0);

  function select(next: T, nextIndex: number) {
    if (next === value) return;
    haptics.selection();
    Animated.spring(slide, {
      toValue: nextIndex,
      useNativeDriver: true,
      damping: 20,
      stiffness: 260,
      mass: 0.6
    }).start();
    onChange(next);
  }

  return (
    <View
      onLayout={(e) => (width.current = e.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        padding: 2,
        borderRadius: t.radius.md,
        backgroundColor: t.c('--color-surface-2')
      }}
    >
      <Animated.View
        // The thumb, behind the labels. Sized as a fraction so it does not need
        // a measured pixel width before the first paint.
        style={{
          position: 'absolute',
          top: 2,
          bottom: 2,
          left: 2,
          width: `${100 / segments.length}%`,
          borderRadius: t.radius.sm,
          backgroundColor: t.c('--color-surface'),
          transform: [
            {
              translateX: slide.interpolate({
                inputRange: segments.map((_, i) => i),
                outputRange: segments.map((_, i) => i * (width.current / segments.length))
              })
            }
          ],
          ...t.elevation('panel')
        }}
      />
      {segments.map((s, i) => {
        const active = s.value === value;
        return (
          <Pressable
            key={s.value}
            press="none"
            onPress={() => select(s.value, i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{ flex: 1, height: 32, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text variant="xs" weight="600" tone={active ? 'default' : 'muted'}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
