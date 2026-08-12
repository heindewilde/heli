import { useCallback, useRef, useState } from 'react';
import { Animated, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Clock, Sparkles } from 'lucide-react-native';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';
import { Pressable } from '../../src/ui/Pressable';
import { Avatar } from '../../src/ui/Avatar';
import { EmptyState } from '../../src/ui/EmptyState';
import { Reminders } from '../../src/features/Reminders';
import { useTheme } from '../../src/theme';
import { useRows, useWorkspace, refreshInteractions, useOnline, usePendingWrites } from '../../src/db/sync';
import { listInteractions } from '../../src/db/cache';
import { dayBucket, formatTime, TYPE_LABELS } from '../../../src/lib/interactionMeta';
import type { InteractionType } from '../../../src/lib/interactionTypes';

/**
 * Today.
 *
 * This screen has **no web equivalent**, and that is the point: it is the one
 * the phone is for. A laptop opens to a dashboard of counts because there is
 * room for counts; a phone gets picked up for thirty seconds between two other
 * things, so it opens to what is happening now and what needs doing.
 *
 * Counts are deliberately absent. "20 people" is not something anyone acts on.
 */
export default function HomeScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [refreshing, setRefreshing] = useState(false);
  const ws = useWorkspace();
  const online = useOnline();
  const queued = usePendingWrites();


  const { rows } = useRows(
    'interactions',
    async () => (ws ? listInteractions(ws, { limit: 25 }) : []),
    [ws]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshInteractions();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const recent = rows ?? [];
  const greeting = greetingFor(new Date());

  return (
    <Screen title={greeting} scrollY={scrollY}>
      <ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true
        })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 72 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.c('--color-subtle')}
          />
        }
      >
        {!online || queued > 0 ? <ConnectionBar online={online} queued={queued} /> : null}

        {/* First, because it is the only thing on this screen that is time-
            sensitive. Renders nothing when there is nothing due. */}
        <Reminders />

        <Section title="Recent activity" icon={<Clock size={14} color={t.c('--color-subtle')} />}>
          {recent.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={22} color={t.c('--color-subtle')} />}
              title="Nothing logged yet"
              body="Calls, emails and meetings you record will show up here."
            />
          ) : (
            groupByDay(recent).map(([label, items]) => (
              <View key={label}>
                <Text
                  variant="2xs"
                  weight="600"
                  tone="subtle"
                  style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}
                >
                  {label.toUpperCase()}
                </Text>
                {items.map((i) => (
                  <Pressable
                    key={i.id}
                    press="row"
                    onPress={() => router.push(`/interaction/${i.id}`)}
                    style={{
                      flexDirection: 'row',
                      gap: 12,
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 11,
                      backgroundColor: t.c('--color-surface')
                    }}
                  >
                    <Avatar
                      name={i.people[0]?.name ?? i.title}
                      uri={i.people[0]?.avatarUrl}
                      size="sm"
                    />
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text variant="sm" weight="500" numberOfLines={1}>
                        {i.title}
                      </Text>
                      <Text variant="2xs" tone="muted" numberOfLines={1}>
                        {TYPE_LABELS[i.type as InteractionType] ?? i.type} ·{' '}
                        {formatTime(i.occurredAt)}
                        {i.people[0] ? ` · ${i.people[0].name}` : ''}
                      </Text>
                    </View>
                    {i.pending ? (
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: t.c('--color-subtle')
                        }}
                      />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ))
          )}
        </Section>
      </ScrollView>
    </Screen>
  );
}

function ConnectionBar({ online, queued }: { online: boolean; queued: number }) {
  const t = useTheme();
  // One line, never a modal. The work is not lost and the app is not broken —
  // saying so quietly is the whole job.
  const message = !online
    ? queued > 0
      ? `Offline · ${queued} change${queued === 1 ? '' : 's'} waiting`
      : 'Offline · showing your last sync'
    : `Syncing ${queued} change${queued === 1 ? '' : 's'}…`;

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: t.radius.md,
        backgroundColor: online ? t.c('--color-info-bg') : t.c('--color-surface-2'),
        borderWidth: 1,
        borderColor: online ? t.c('--color-info-border') : t.c('--color-border')
      }}
    >
      <Text variant="xs" tone={online ? 'accent' : 'muted'}>
        {message}
      </Text>
    </View>
  );
}

function Section({
  title,
  icon,
  children
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 16,
          paddingTop: 10
        }}
      >
        {icon}
        <Text variant="xs" weight="600" tone="muted">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function groupByDay<T extends { occurredAt: number }>(items: T[]): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const { label } = dayBucket(item.occurredAt);
    out.set(label, [...(out.get(label) ?? []), item]);
  }
  return [...out.entries()];
}
