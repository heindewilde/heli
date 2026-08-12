import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { House, Users, Briefcase, Clock, Ellipsis } from 'lucide-react-native';
import { useTheme } from '../../src/theme';

/**
 * Five tabs, in the order someone reaches for them.
 *
 * Home first because it answers "what now"; People second because it answers
 * "who is this"; Time fourth because it is a verb you do rather than a place
 * you go. The web's nine sidebar entries collapse into Work and More rather
 * than being reproduced — a tab bar with nine items is a menu, and a menu is
 * what a sidebar already is.
 *
 * The bar is translucent on iOS with content scrolling under it, which is what
 * the platform does and what makes a list feel like it continues past the
 * chrome rather than stopping at it. Android gets an opaque bar, because
 * material there is a different idea and a blurred one looks foreign.
 */
export default function TabsLayout() {
  const t = useTheme();
  const ios = Platform.OS === 'ios';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.c('--color-text'),
        tabBarInactiveTintColor: t.c('--color-subtle'),
        tabBarStyle: {
          position: ios ? 'absolute' : 'relative',
          borderTopColor: t.c('--color-border'),
          borderTopWidth: 0.5,
          backgroundColor: ios ? 'transparent' : t.c('--color-surface'),
          elevation: 0
        },
        tabBarBackground: ios
          ? () => (
              <BlurView
                tint={t.name === 'dark' ? 'dark' : 'light'}
                intensity={80}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
            )
          : undefined,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <House color={color} size={size} strokeWidth={2} />
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: 'People',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} strokeWidth={2} />
        }}
      />
      <Tabs.Screen
        name="work"
        options={{
          title: 'Work',
          tabBarIcon: ({ color, size }) => <Briefcase color={color} size={size} strokeWidth={2} />
        }}
      />
      <Tabs.Screen
        name="time"
        options={{
          title: 'Time',
          tabBarIcon: ({ color, size }) => <Clock color={color} size={size} strokeWidth={2} />
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ellipsis color={color} size={size} strokeWidth={2} />
        }}
      />
    </Tabs>
  );
}
