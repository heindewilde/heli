import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Linking, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  GitBranch,
  LogOut,
  Send,
  TrendingUp
} from 'lucide-react-native';
import { Screen } from '../../src/ui/Screen';
import { Text } from '../../src/ui/Text';
import { Pressable } from '../../src/ui/Pressable';
import { useTheme } from '../../src/theme';
import { haptics } from '../../src/ui/haptics';
import { api } from '../../src/api/endpoints';
import { clearCredential, loadCredential } from '../../src/api/credentials';
import { purgeAll } from '../../src/db';
import { forgetWorkspace } from '../../src/db/sync';
import { APP_NAME } from '../../../src/lib/branding';

/**
 * Everything that is not a daily verb.
 *
 * The interesting decisions here are the **links out**. A few things genuinely
 * belong on the web, and the honest move is to say so and open the browser
 * rather than build a cramped version:
 *
 *   - inviting and removing members, which has an email side effect;
 *   - the contact-import triage screen, which is a few thousand rows and
 *     multi-axis filtering;
 *   - adding a calendar feed, which means pasting a secret URL;
 *   - pairing another device, which must stay cookie-authenticated so a stolen
 *     phone cannot mint a replacement for itself.
 *
 * Each of those is a stated trade, not an omission — which is why they carry an
 * explicit "opens in your browser" affordance instead of failing quietly.
 */
export default function MoreScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const [me, setMe] = useState<{ email: string | null; workspace: string | null } | null>(null);
  const [server, setServer] = useState<string>('');

  useEffect(() => {
    void (async () => {
      const cred = await loadCredential();
      setServer(cred?.server ?? '');
      try {
        const res = await api.me();
        setMe({ email: res.user.email, workspace: res.workspace.name });
      } catch {
        // Offline: the header just shows less. Not worth an error state.
      }
    })();
  }, []);

  const openWeb = useCallback(
    (path: string) => {
      haptics.tick();
      void Linking.openURL(`${server}${path}`);
    },
    [server]
  );

  const signOut = useCallback(() => {
    Alert.alert(
      'Sign out?',
      `This device will be unpaired. Anything not yet synced will be lost.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            haptics.heavy();
            // Tell the server first, but do not let a failure trap someone on a
            // device they want to leave — the local credential goes either way.
            await api.unpairSelf().catch(() => {});
            await clearCredential();
            forgetWorkspace();
            await purgeAll();
            router.replace('/pair');
          }
        }
      ]
    );
  }, [router]);

  return (
    <Screen title="More" scrollY={scrollY}>
      <ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true
        })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 72 }}
      >
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 2 }}>
          <Text variant="lg" weight="600">
            {me?.workspace ?? 'Workspace'}
          </Text>
          <Text variant="xs" tone="muted">
            {me?.email ?? server.replace(/^https?:\/\//, '')}
          </Text>
        </View>

        <Group title="In the app">
          <Row
            icon={<FolderOpen size={18} color={t.c('--color-interactive')} />}
            label="Collections"
            onPress={() => router.push('/collections')}
          />
          <Row
            icon={<GitBranch size={18} color={t.c('--color-interactive')} />}
            label="Pipelines"
            onPress={() => router.push('/pipelines')}
          />
          <Row
            icon={<Send size={18} color={t.c('--color-interactive')} />}
            label="Outreach"
            onPress={() => router.push('/outreach')}
          />
          <Row
            icon={<TrendingUp size={18} color={t.c('--color-muted')} />}
            label="Availability"
            external
            onPress={() => openWeb('/availability')}
            last
          />
        </Group>

        <Group title="Opens in your browser">
          <Row
            icon={<Building2 size={18} color={t.c('--color-muted')} />}
            label="Team and invites"
            external
            onPress={() => openWeb('/settings#team')}
          />
          <Row
            icon={<CalendarDays size={18} color={t.c('--color-muted')} />}
            label="Calendars"
            external
            onPress={() => openWeb('/settings#calendars')}
          />
          <Row
            icon={<ExternalLink size={18} color={t.c('--color-muted')} />}
            label="Import contacts"
            external
            onPress={() => openWeb('/settings#import')}
            last
          />
        </Group>

        <Group title="This device">
          <Row
            icon={<LogOut size={18} color={t.c('--color-danger')} />}
            label="Sign out"
            danger
            onPress={signOut}
            last
          />
        </Group>

        <Text variant="2xs" tone="subtle" style={{ textAlign: 'center', paddingTop: 20 }}>
          {APP_NAME} · {server.replace(/^https?:\/\//, '')}
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 18 }}>
      <Text
        variant="2xs"
        weight="600"
        tone="subtle"
        style={{ paddingHorizontal: 16, paddingBottom: 7 }}
      >
        {title.toUpperCase()}
      </Text>
      <View
        style={{
          marginHorizontal: 16,
          borderRadius: t.radius.md,
          backgroundColor: t.c('--color-surface'),
          borderWidth: 1,
          borderColor: t.c('--color-border'),
          overflow: 'hidden'
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
  external,
  danger,
  last
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  external?: boolean;
  danger?: boolean;
  last?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      press="row"
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        // 52 clears both platforms' minimum target with room for a finger that
        // is not aiming carefully.
        height: 52,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.c('--color-border')
      }}
    >
      {icon}
      <Text variant="sm" weight="500" tone={danger ? 'danger' : 'default'} style={{ flex: 1 }}>
        {label}
      </Text>
      {external ? (
        <ExternalLink size={15} color={t.c('--color-subtle')} />
      ) : danger ? null : (
        <ChevronRight size={17} color={t.c('--color-subtle')} />
      )}
    </Pressable>
  );
}
