import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Square, Clock } from 'lucide-react-native';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';
import { Pressable } from '../../src/ui/Pressable';
import { EmptyState } from '../../src/ui/EmptyState';
import { useTheme } from '../../src/theme';
import { haptics } from '../../src/ui/haptics';
import { api } from '../../src/api/endpoints';
import { ApiError } from '../../src/api/client';
import { useElapsed, formatElapsed } from '../../src/features/time/useElapsed';
import { formatMinutes } from '../../../src/lib/duration';
import { dayBucket, formatTime } from '../../../src/lib/interactionMeta';

/**
 * Tracked time.
 *
 * `time_entries.ended_at IS NULL` *is* the running timer — one row, no flag, no
 * second table — which is precisely what lets you start on a laptop and stop
 * here. So this screen's job is to make that shared state feel immediate: the
 * clock is derived from `startedAt` rather than counted, and starting or
 * stopping repaints before the request returns.
 *
 * `/time` is deliberately absent from the web's `NAV_CACHEABLE`, on the grounds
 * that a page carrying a live timer must never be painted from a stored copy.
 * The same rule applies here, which is why this screen reads the server rather
 * than the offline mirror: a stale timer is worse than a spinner.
 */
export default function TimeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const [running, setRunning] = useState<Record<string, unknown> | null>(null);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState('');

  const startedAt = running ? (running.startedAt as number) : null;
  const elapsed = useElapsed(startedAt);

  const load = useCallback(async () => {
    try {
      const res = await api.time({ limit: 100 });
      setRunning(res.running);
      setItems(res.items);
      if (res.running) setDescription((res.running.description as string) ?? '');
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'offline') throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(async () => {
    setBusy(true);
    // Optimistic: the button state flips now, not in 300ms. A timer control
    // that lags is the one place lag is unmistakable, because the number
    // beside it is already moving.
    const wasRunning = !!running;
    setRunning(wasRunning ? null : { startedAt: Date.now(), description });
    haptics.success();

    try {
      if (wasRunning) await api.stopTimer();
      else await api.startTimer({ description: description || null });
      await load();
    } catch {
      haptics.error();
      await load();
    } finally {
      setBusy(false);
    }
  }, [running, description, load]);

  return (
    <Screen title="Time" scrollY={scrollY}>
      <ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true
        })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 72 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={t.c('--color-subtle')}
          />
        }
      >
        {/* The timer. Deliberately the largest thing on the screen. */}
        <View
          style={{
            margin: 16,
            padding: 18,
            borderRadius: t.radius.lg,
            backgroundColor: t.c('--color-surface'),
            borderWidth: 1,
            borderColor: running ? t.c('--color-success-border') : t.c('--color-border'),
            gap: 14,
            ...t.elevation('panel')
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                variant="3xl"
                weight="700"
                tabular
                tone={running ? 'default' : 'subtle'}
                // The clock must never resize as the digits change; tabular
                // figures plus a fixed scale is what keeps it from twitching.
                maxFontSizeMultiplier={1.1}
              >
                {formatElapsed(elapsed)}
              </Text>
              <Text variant="2xs" tone="muted">
                {running ? 'Running' : 'Not running'}
              </Text>
            </View>

            <Pressable
              press="button"
              onPress={toggle}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={running ? 'Stop timer' : 'Start timer'}
              style={{
                width: 62,
                height: 62,
                borderRadius: 31,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: running ? t.c('--color-danger') : t.c('--color-accent')
              }}
            >
              {busy ? (
                <ActivityIndicator color={t.c('--color-accent-fg')} />
              ) : running ? (
                <Square size={22} color={t.c('--color-accent-fg')} fill={t.c('--color-accent-fg')} />
              ) : (
                <Play size={24} color={t.c('--color-accent-fg')} fill={t.c('--color-accent-fg')} />
              )}
            </Pressable>
          </View>

          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What are you working on?"
            placeholderTextColor={t.c('--color-subtle')}
            style={{
              height: 42,
              borderRadius: t.radius.md,
              backgroundColor: t.c('--color-surface-2'),
              paddingHorizontal: 12,
              color: t.c('--color-text'),
              fontSize: 15
            }}
          />
        </View>

        {loading ? null : items.length === 0 ? (
          <EmptyState
            icon={<Clock size={22} color={t.c('--color-subtle')} />}
            title="No time logged yet"
            body="Start the timer above, and stop it from any device you're signed in on."
          />
        ) : (
          groupByDay(items).map(([label, entries]) => (
            <View key={label} style={{ marginTop: 8 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingBottom: 6
                }}
              >
                <Text variant="2xs" weight="600" tone="subtle">
                  {label.toUpperCase()}
                </Text>
                <Text variant="2xs" weight="600" tone="muted" tabular>
                  {formatMinutes(totalMinutes(entries))}
                </Text>
              </View>

              {entries.map((e) => (
                <View
                  key={String(e.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 11,
                    backgroundColor: t.c('--color-surface')
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="sm" weight="500" numberOfLines={1}>
                      {(e.description as string) || 'Untitled'}
                    </Text>
                    <Text variant="2xs" tone="muted">
                      {(e.projectName as string) ?? 'No project'} ·{' '}
                      {formatTime(e.startedAt as number)}
                    </Text>
                  </View>
                  <Text variant="sm" weight="600" tabular>
                    {formatMinutes(minutesOf(e))}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function minutesOf(e: Record<string, unknown>): number {
  // There is no duration column — both timestamps are stored and the duration
  // is derived, so the two representations cannot drift.
  const start = e.startedAt as number;
  const end = (e.endedAt as number | null) ?? Date.now();
  return Math.max(0, Math.round((end - start) / 60000));
}

function totalMinutes(entries: Record<string, unknown>[]): number {
  return entries.reduce((n, e) => n + minutesOf(e), 0);
}

function groupByDay(items: Record<string, unknown>[]): [string, Record<string, unknown>[]][] {
  const out = new Map<string, Record<string, unknown>[]>();
  for (const item of items) {
    const { label } = dayBucket(item.startedAt as number);
    out.set(label, [...(out.get(label) ?? []), item]);
  }
  return [...out.entries()];
}
