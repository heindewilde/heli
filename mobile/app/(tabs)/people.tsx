import { useCallback, useRef, useState } from 'react';
import { Animated, Platform, RefreshControl, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, Star, Users } from 'lucide-react-native';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';
import { Pressable } from '../../src/ui/Pressable';
import { Avatar } from '../../src/ui/Avatar';
import { SkeletonRow } from '../../src/ui/Skeleton';
import { EmptyState } from '../../src/ui/EmptyState';
import { SwipeRow } from '../../src/ui/SwipeRow';
import { useTheme } from '../../src/theme';
import { haptics } from '../../src/ui/haptics';
import { useRows, refreshPeople, patchPerson } from '../../src/db/sync';
import { listPeople, type PersonRow } from '../../src/db/cache';
import { loadCredential } from '../../src/api/credentials';
import { formatLastSeen } from '../../../src/lib/interactionMeta';

/**
 * The list this app is mostly used for.
 *
 * `FlashList` rather than `FlatList`: it recycles rows instead of mounting one
 * per item, which is the difference between a workspace of 200 people scrolling
 * at 60fps and one of 3,000 stuttering. `estimatedItemSize` is what makes that
 * work, so it has to match the real row height — 64 here, measured, not guessed.
 *
 * Rows read from SQLite and are never awaited on the network. A refresh writes
 * into the mirror and the change bus repaints; pulling to refresh is therefore
 * genuinely optional rather than the only way to see anything.
 */
const ROW_HEIGHT = 64;

export default function PeopleScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [ws, setWs] = useState<string | null>(null);

  useRows('people', async () => {
    setWs((await loadCredential())?.workspaceId ?? null);
    return null;
  }, []);

  const { rows, loading } = useRows(
    'people',
    async () => (ws ? listPeople(ws, { q: q.trim() || undefined, limit: 200 }) : []),
    [ws, q]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshPeople({ q: q.trim() || undefined });
    } finally {
      setRefreshing(false);
    }
  }, [q]);

  const people = rows ?? [];

  return (
    <Screen
      title="People"
      scrollY={scrollY}
      action={
        <Pressable
          press="button"
          accessibilityLabel="Add person"
          onPress={() => router.push('/person/new')}
          style={{ padding: 6 }}
        >
          <Text variant="xl" tone="accent" weight="400">
            ＋
          </Text>
        </Pressable>
      }
    >
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 38,
            paddingHorizontal: 10,
            borderRadius: t.radius.md,
            backgroundColor: t.c('--color-surface-2')
          }}
        >
          <Search size={16} color={t.c('--color-subtle')} strokeWidth={2} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search people"
            placeholderTextColor={t.c('--color-subtle')}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={{ flex: 1, color: t.c('--color-text'), fontSize: 16, padding: 0 }}
          />
        </View>
      </View>

      {loading && people.length === 0 ? (
        <View>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      ) : (
        <FlashList
          data={people}
          estimatedItemSize={ROW_HEIGHT}
          keyExtractor={(p) => p.id}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: true
          })}
          scrollEventThrottle={16}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={{ paddingBottom: insets.bottom + 64 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={t.c('--color-subtle')}
            />
          }
          ListEmptyComponent={
            q ? (
              <EmptyState
                icon={<Search size={22} color={t.c('--color-subtle')} />}
                title={`Nothing matches “${q}”`}
                body="Try a shorter search, or a company name."
              />
            ) : (
              <EmptyState
                icon={<Users size={22} color={t.c('--color-subtle')} />}
                title="No people yet"
                body="Save someone from the browser extension, or add them here."
              />
            )
          }
          renderItem={({ item }) => (
            <PersonListRow
              person={item}
              onPress={() => router.push(`/person/${item.id}`)}
            />
          )}
        />
      )}
    </Screen>
  );
}

function PersonListRow({ person, onPress }: { person: PersonRow; onPress: () => void }) {
  const t = useTheme();
  const favorite = person.isFavorite === 1;

  return (
    <SwipeRow
      right={{
        label: favorite ? 'Unstar' : 'Star',
        color: '--color-warning',
        icon: <Star size={18} color="#fff" fill={favorite ? '#fff' : 'transparent'} />,
        onAction: () => {
          haptics.success();
          void patchPerson(
            person.id,
            { is_favorite: favorite ? 0 : 1 },
            { isFavorite: !favorite }
          );
        }
      }}
    >
      <Pressable
        press="row"
        onPress={onPress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          height: ROW_HEIGHT,
          backgroundColor: t.c('--color-surface')
        }}
      >
        <Avatar name={person.name} uri={person.avatarUrl} size="md" />

        <View style={{ flex: 1, gap: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text variant="sm" weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>
              {person.name}
            </Text>
            {favorite ? (
              <Star size={12} color={t.c('--color-warning')} fill={t.c('--color-warning')} />
            ) : null}
            {person.pending ? (
              // A queued write, shown rather than hidden. "Saved" that hasn't
              // reached the server is a lie people find out about later.
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: t.c('--color-subtle')
                }}
              />
            ) : null}
          </View>
          <Text variant="xs" tone="muted" numberOfLines={1}>
            {[person.role, person.companyName].filter(Boolean).join(' · ') || '—'}
          </Text>
        </View>

        {person.lastAt ? (
          <Text variant="2xs" tone="subtle" tabular>
            {formatLastSeen(person.lastAt)}
          </Text>
        ) : null}
      </Pressable>
    </SwipeRow>
  );
}
