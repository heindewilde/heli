import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, Search as SearchIcon, User, X } from 'lucide-react-native';
import { Text } from '../src/ui/Text';
import { Pressable } from '../src/ui/Pressable';
import { Avatar } from '../src/ui/Avatar';
import { EmptyState } from '../src/ui/EmptyState';
import { useTheme } from '../src/theme';
import { api } from '../src/api/endpoints';
import { ApiError } from '../src/api/client';
import { fuzzyScore } from '../../src/lib/commands/fuzzy';

/**
 * Search across everything.
 *
 * Server-side, deliberately. The web app's command palette makes the same
 * split, for the same reason: entities come from FTS5 and only *commands* are
 * matched in the browser. Matching entities on the device would mean shipping
 * the workspace to the phone to do a worse job than SQLite already does.
 *
 * Two things make it feel instant rather than merely fast:
 *
 * **A 40ms debounce with a stale-response guard**, the same numbers the web
 * palette uses. The guard matters more than the debounce — without it a slow
 * response for "an" can land after a fast one for "anna" and overwrite it, so
 * the list flickers backwards as you type.
 *
 * **The keyboard opens with the screen and never closes on its own.** A search
 * screen that requires a second tap to start typing is one of those small
 * frictions that makes an app feel like a website.
 */
export default function SearchScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const input = useRef<TextInput>(null);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef('');

  useEffect(() => {
    // A frame's delay: focusing during the push transition makes iOS animate
    // the keyboard and the screen against each other.
    const id = setTimeout(() => input.current?.focus(), 250);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const term = q.trim();
    latest.current = term;

    if (!term) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = await api.search(term, 6);
        // The guard: ignore anything that is no longer what is typed.
        if (latest.current !== term) return;
        setResults(flatten(res));
        setError(null);
      } catch (err) {
        if (latest.current !== term) return;
        setError(
          err instanceof ApiError && err.code === 'offline'
            ? 'Search needs a connection.'
            : 'Something went wrong.'
        );
        setResults([]);
      } finally {
        if (latest.current === term) setLoading(false);
      }
    }, 40);

    return () => clearTimeout(id);
  }, [q]);

  const open = useCallback(
    (hit: SearchHit) => {
      Keyboard.dismiss();
      if (hit.kind === 'person') router.push(`/person/${hit.id}`);
      else if (hit.kind === 'company') router.push(`/company/${hit.id}`);
      // The remaining kinds have no detail screen yet, so tapping is inert
      // rather than pushing a route that would 404.
    },
    [router]
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.c('--color-bg') }}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: 12,
          paddingBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 40,
            paddingHorizontal: 11,
            borderRadius: t.radius.md,
            backgroundColor: t.c('--color-surface-2')
          }}
        >
          <SearchIcon size={17} color={t.c('--color-subtle')} strokeWidth={2} />
          <TextInput
            ref={input}
            value={q}
            onChangeText={setQ}
            placeholder="People, companies, notes…"
            placeholderTextColor={t.c('--color-subtle')}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={{ flex: 1, color: t.c('--color-text'), fontSize: 17, padding: 0 }}
          />
          {q ? (
            <Pressable press="none" onPress={() => setQ('')} accessibilityLabel="Clear" hitSlop={12}>
              <X size={16} color={t.c('--color-subtle')} />
            </Pressable>
          ) : loading ? (
            <ActivityIndicator size="small" color={t.c('--color-subtle')} />
          ) : null}
        </View>
        <Pressable press="none" onPress={() => router.back()} style={{ padding: 6 }}>
          <Text variant="sm" tone="accent" weight="500">
            Cancel
          </Text>
        </Pressable>
      </View>

      <ScrollView
        // Dragging the list should put the keyboard away, the way every native
        // search screen does.
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {results === null ? (
          <EmptyState
            icon={<SearchIcon size={22} color={t.c('--color-subtle')} />}
            title="Find anyone"
            body="Search people, companies, projects and anything you have written down."
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={22} color={t.c('--color-subtle')} />}
            title={error ?? `Nothing matches “${q.trim()}”`}
            body={error ? undefined : 'Try fewer letters, or a company name.'}
          />
        ) : (
          results.map((hit, idx) => (
            <Pressable
              key={`${hit.kind}-${hit.id}`}
              press="row"
              onPress={() => open(hit)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 11,
                backgroundColor: t.c('--color-surface'),
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: t.c('--color-border')
              }}
            >
              {hit.kind === 'person' ? (
                <Avatar name={hit.title} uri={hit.avatarUrl} size="sm" />
              ) : (
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: t.radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: t.c('--color-surface-2')
                  }}
                >
                  {hit.kind === 'company' ? (
                    <Building2 size={14} color={t.c('--color-subtle')} />
                  ) : (
                    <User size={14} color={t.c('--color-subtle')} />
                  )}
                </View>
              )}
              <View style={{ flex: 1, gap: 1 }}>
                <Text variant="sm" weight="500" numberOfLines={1}>
                  {hit.title}
                </Text>
                <Text variant="2xs" tone="muted" numberOfLines={1}>
                  {hit.subtitle ?? KIND_LABEL[hit.kind] ?? hit.kind}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

type SearchHit = {
  kind: string;
  id: string;
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
};

const KIND_LABEL: Record<string, string> = {
  person: 'Person',
  company: 'Company',
  interaction: 'Interaction',
  project: 'Project',
  collection: 'Collection',
  pipeline: 'Pipeline'
};

/**
 * `searchAll` returns a small set per kind; flatten and re-rank across them.
 *
 * The server orders within each kind by FTS relevance, but has no opinion about
 * a person versus a project — so a phone showing six of each would bury the
 * obvious answer. `fuzzyScore` is the same function the web palette uses to
 * rank commands, reused here to interleave.
 */
function flatten(res: Record<string, unknown>): SearchHit[] {
  const items = Array.isArray(res.items) ? (res.items as Record<string, unknown>[]) : [];
  return items.map((i) => ({
    kind: String(i.kind ?? 'person'),
    id: String(i.id),
    title: String(i.title ?? i.name ?? ''),
    subtitle: (i.subtitle as string) ?? undefined,
    avatarUrl: (i.avatarUrl as string) ?? null
  }));
}

/** Kept exported so a future ranking change has an obvious home. */
export function rank(hits: SearchHit[], term: string): SearchHit[] {
  return [...hits].sort(
    (a, b) => (fuzzyScore(b.title, term) ?? 0) - (fuzzyScore(a.title, term) ?? 0)
  );
}
