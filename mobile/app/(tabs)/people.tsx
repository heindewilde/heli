import { useCallback, useRef, useState } from 'react';
import { Animated, Platform, RefreshControl, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, Search, Star, Users } from 'lucide-react-native';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';
import { Pressable } from '../../src/ui/Pressable';
import { Avatar } from '../../src/ui/Avatar';
import { SkeletonRow } from '../../src/ui/Skeleton';
import { EmptyState } from '../../src/ui/EmptyState';
import { SwipeRow } from '../../src/ui/SwipeRow';
import { SegmentedControl } from '../../src/ui/SegmentedControl';
import { useTheme } from '../../src/theme';
import { haptics } from '../../src/ui/haptics';
import { useRows, refreshPeople, refreshCompanies, patchPerson } from '../../src/db/sync';
import { listPeople, listCompanies, type PersonRow, type CompanyRow } from '../../src/db/cache';
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
  const [tab, setTab] = useState<'people' | 'companies'>('people');
  const [refreshing, setRefreshing] = useState(false);
  const [ws, setWs] = useState<string | null>(null);

  useRows('people', async () => {
    setWs((await loadCredential())?.workspaceId ?? null);
    return null;
  }, []);

  const { rows: people, loading: loadingPeople } = useRows(
    'people',
    async () => (ws ? listPeople(ws, { q: q.trim() || undefined, limit: 200 }) : []),
    [ws, q]
  );
  const { rows: companies, loading: loadingCompanies } = useRows(
    'companies',
    async () => (ws ? listCompanies(ws, { q: q.trim() || undefined, limit: 200 }) : []),
    [ws, q]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Both, whichever is showing: the other tab is one tap away and a stale
      // list behind a segmented control is the kind of thing nobody thinks to
      // pull-to-refresh.
      await Promise.all([
        refreshPeople({ q: q.trim() || undefined }),
        refreshCompanies({ q: q.trim() || undefined })
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [q]);

  const showingPeople = tab === 'people';
  const loading = showingPeople ? loadingPeople : loadingCompanies;
  const rows = showingPeople ? (people ?? []) : (companies ?? []);

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
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2 }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          segments={[
            { value: 'people', label: 'People' },
            { value: 'companies', label: 'Companies' }
          ]}
        />
      </View>

      <View style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', gap: 8 }}>
        <View
          style={{
            flex: 1,
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
            placeholder={showingPeople ? 'Filter people' : 'Filter companies'}
            placeholderTextColor={t.c('--color-subtle')}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={{ flex: 1, color: t.c('--color-text'), fontSize: 16, padding: 0 }}
          />
        </View>
        {/* Filtering the list and searching the workspace are different acts:
            one narrows what is already here (and works offline), the other asks
            the server about everything. Conflating them is why a lot of apps
            have a search box that sometimes finds things and sometimes does
            not. */}
        <Pressable
          press="button"
          onPress={() => router.push('/search')}
          accessibilityLabel="Search everything"
          style={{
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: t.radius.md,
            backgroundColor: t.c('--color-surface-2')
          }}
        >
          <Search size={17} color={t.c('--color-interactive')} strokeWidth={2.2} />
        </Pressable>
      </View>

      {loading && rows.length === 0 ? (
        <View>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      ) : (
        <FlashList
          data={rows as (PersonRow | CompanyRow)[]}
          estimatedItemSize={ROW_HEIGHT}
          keyExtractor={(r) => r.id}
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
                icon={
                  showingPeople ? (
                    <Users size={22} color={t.c('--color-subtle')} />
                  ) : (
                    <Building2 size={22} color={t.c('--color-subtle')} />
                  )
                }
                title={showingPeople ? 'No people yet' : 'No companies yet'}
                body="Save one from the browser extension, or add it here."
              />
            )
          }
          renderItem={({ item }) =>
            showingPeople ? (
              <PersonListRow
                person={item as PersonRow}
                onPress={() => router.push(`/person/${item.id}`)}
              />
            ) : (
              <CompanyListRow company={item as CompanyRow} />
            )
          }
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

function CompanyListRow({ company }: { company: CompanyRow }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        height: ROW_HEIGHT,
        backgroundColor: t.c('--color-surface')
      }}
    >
      {/* A rounded square, not a circle. The shape is how you tell an
          organisation from a person at a glance, before reading either. */}
      <Avatar name={company.name} uri={company.logoUrl ?? company.faviconUrl} size="md" shape="square" />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="sm" weight="600" numberOfLines={1}>
          {company.name}
        </Text>
        <Text variant="xs" tone="muted" numberOfLines={1}>
          {[company.industry, company.location].filter(Boolean).join(' · ') ||
            company.domain ||
            '—'}
        </Text>
      </View>
      {company.lastAt ? (
        <Text variant="2xs" tone="subtle" tabular>
          {formatLastSeen(company.lastAt)}
        </Text>
      ) : null}
    </View>
  );
}
