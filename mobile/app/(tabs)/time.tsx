import { useRef } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { Screen } from '../../src/ui/Screen';
import { EmptyState } from '../../src/ui/EmptyState';
import { useTheme } from '../../src/theme';

/** Projects, pipelines, collections and outreach. Wired to v1 in the next pass. */
export default function TimeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  return (
    <Screen title="Time" scrollY={scrollY}>
      <ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true
        })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 72 }}
      >
        <View style={{ paddingTop: 40 }}>
          <EmptyState
            icon={<Clock size={22} color={t.c('--color-subtle')} />}
            title="Track your time"
            body="Start a timer here and stop it anywhere — it is the same running entry."
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
