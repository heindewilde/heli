import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Pressable } from '../ui/Pressable';
import { SkeletonRow } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { useTheme } from '../theme';
import { ApiError } from '../api/client';

/**
 * Collections, pipelines and outreach are the same screen three times.
 *
 * Each is a flat list of named things with a subtitle and a count, reached from
 * More rather than from a tab — they are places you go occasionally, not verbs
 * you do daily. Writing three near-identical files would mean three places to
 * fix a scroll bug, so the shape is shared and only the fetch and the row
 * summary differ.
 *
 * These read the network directly rather than the offline mirror. That is a
 * deliberate limit, not an oversight: the mirror holds what a phone needs when
 * it has no signal, and a pipeline board is not that. Mirroring everything
 * would triple the schema for screens nobody opens on a train.
 */
export type SimpleItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
};

export function SimpleList({
  title,
  fetch: fetchItems,
  emptyTitle,
  emptyBody,
  icon,
  onOpen
}: {
  title: string;
  fetch: () => Promise<SimpleItem[]>;
  emptyTitle: string;
  emptyBody: string;
  icon?: ReactNode;
  onOpen?: (id: string) => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const [items, setItems] = useState<SimpleItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await fetchItems());
      setOffline(false);
    } catch (err) {
      setItems([]);
      setOffline(err instanceof ApiError && err.code === 'offline');
    }
  }, [fetchItems]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: t.c('--color-bg') }}>
      <View
        style={{
          paddingTop: insets.top,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          paddingHorizontal: 8,
          height: insets.top + 46,
          borderBottomWidth: 1,
          borderBottomColor: t.c('--color-border')
        }}
      >
        <Pressable press="button" onPress={() => router.back()} accessibilityLabel="Back" style={{ padding: 8 }}>
          <ChevronLeft size={26} color={t.c('--color-interactive')} strokeWidth={2} />
        </Pressable>
        <Text variant="base" weight="600">
          {title}
        </Text>
      </View>

      <ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true
        })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
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
        {items === null ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
        ) : items.length === 0 ? (
          <EmptyState
            icon={icon}
            title={offline ? 'Offline' : emptyTitle}
            body={
              offline
                ? `${title} are not kept for offline use — reconnect to see them.`
                : emptyBody
            }
          />
        ) : (
          items.map((item, idx) => (
            <Pressable
              key={item.id}
              press="row"
              onPress={() => onOpen?.(item.id)}
              disabled={!onOpen}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 13,
                backgroundColor: t.c('--color-surface'),
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: t.c('--color-border')
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="sm" weight="600" numberOfLines={1}>
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text variant="2xs" tone="muted" numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
              {item.meta ? (
                <Text variant="2xs" tone="subtle" tabular>
                  {item.meta}
                </Text>
              ) : null}
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}
