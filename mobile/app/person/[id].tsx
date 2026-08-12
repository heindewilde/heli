import { useCallback, useRef, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Star
} from 'lucide-react-native';
import { Text } from '../../src/ui/Text';
import { Pressable } from '../../src/ui/Pressable';
import { Avatar } from '../../src/ui/Avatar';
import { Button } from '../../src/ui/Button';
import { LogSheet, type LogSheetRef } from '../../src/features/LogSheet';
import { EditPersonSheet, type EditPersonSheetRef } from '../../src/features/EditPersonSheet';
import { useTheme } from '../../src/theme';
import { haptics } from '../../src/ui/haptics';
import { useRows, patchPerson, logInteraction } from '../../src/db/sync';
import { getPerson, listInteractions } from '../../src/db/cache';
import { loadCredential } from '../../src/api/credentials';
import { formatTime, TYPE_LABELS } from '../../../src/lib/interactionMeta';
import type { InteractionType } from '../../../src/lib/interactionTypes';

/**
 * One person.
 *
 * The web version of this page is a two-column layout with a sidebar of fields.
 * A phone gets something different on purpose: identity at the top, then the
 * three things you actually came here to do — **call, message, email** — as
 * primary controls, then the history.
 *
 * Those three are the clearest example of the phone doing something the web
 * cannot. A `tel:` link on a laptop is a shrug; here it is the reason you
 * opened the app while walking to a meeting.
 */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [ws, setWs] = useState<string | null>(null);
  const logSheet = useRef<LogSheetRef>(null);
  const editSheet = useRef<EditPersonSheetRef>(null);

  useRows('people', async () => {
    setWs((await loadCredential())?.workspaceId ?? null);
    return null;
  }, []);

  const { rows: person } = useRows(
    'people',
    async () => (ws && id ? getPerson(ws, id) : null),
    [ws, id]
  );
  const { rows: timeline } = useRows(
    'interactions',
    async () => (ws && id ? listInteractions(ws, { personId: id, limit: 50 }) : []),
    [ws, id]
  );

  const toggleFavorite = useCallback(() => {
    if (!person) return;
    haptics.selection();
    void patchPerson(
      person.id,
      { is_favorite: person.isFavorite ? 0 : 1 },
      { isFavorite: !person.isFavorite }
    );
  }, [person]);

  const quickLog = useCallback(
    async (type: 'call' | 'email' | 'note') => {
      if (!person) return;
      haptics.success();
      await logInteraction({
        type,
        title: `${TYPE_LABELS[type]} with ${person.name}`,
        personId: person.id,
        personName: person.name
      });
    },
    [person]
  );

  if (!person) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c('--color-bg'), paddingTop: insets.top }} />
    );
  }

  const canCall = !!person.phone;
  const canMail = !!person.email;

  return (
    <View style={{ flex: 1, backgroundColor: t.c('--color-bg') }}>
      <View
        style={{
          paddingTop: insets.top,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 8,
          height: insets.top + 44
        }}
      >
        <Pressable press="button" onPress={() => router.back()} accessibilityLabel="Back" style={{ padding: 8 }}>
          <ChevronLeft size={26} color={t.c('--color-interactive')} strokeWidth={2} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable press="button" onPress={toggleFavorite} accessibilityLabel="Favourite" style={{ padding: 8 }}>
            <Star
              size={21}
              color={person.isFavorite ? t.c('--color-warning') : t.c('--color-subtle')}
              fill={person.isFavorite ? t.c('--color-warning') : 'transparent'}
              strokeWidth={2}
            />
          </Pressable>
          <Pressable
            press="button"
            onPress={() => editSheet.current?.open()}
            accessibilityLabel="Edit details"
            style={{ paddingHorizontal: 10, paddingVertical: 8 }}
          >
            <Text variant="sm" tone="accent" weight="500">
              Edit
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 6, paddingBottom: 22 }}>
          <Avatar name={person.name} uri={person.avatarUrl} size="xl" />
          <View style={{ alignItems: 'center', gap: 3 }}>
            <Text variant="2xl" weight="700" style={{ textAlign: 'center' }}>
              {person.name}
            </Text>
            {person.role || person.companyName ? (
              <Pressable
                press="none"
                disabled={!person.companyId}
                onPress={() => person.companyId && router.push(`/company/${person.companyId}`)}
              >
                <Text tone="muted" variant="sm" style={{ textAlign: 'center' }}>
                  {person.role}
                  {person.role && person.companyName ? ' · ' : ''}
                  {person.companyName ? (
                    <Text variant="sm" tone={person.companyId ? 'accent' : 'muted'}>
                      {person.companyName}
                    </Text>
                  ) : null}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* The reason this screen exists on a phone. */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16 }}>
          <QuickAction
            label="Call"
            icon={<Phone size={19} color={t.c(canCall ? '--color-interactive' : '--color-subtle')} />}
            disabled={!canCall}
            onPress={() => {
              haptics.tick();
              void Linking.openURL(`tel:${person.phone}`);
              void quickLog('call');
            }}
          />
          <QuickAction
            label="Message"
            icon={<MessageSquare size={19} color={t.c(canCall ? '--color-interactive' : '--color-subtle')} />}
            disabled={!canCall}
            onPress={() => {
              haptics.tick();
              void Linking.openURL(`sms:${person.phone}`);
            }}
          />
          <QuickAction
            label="Email"
            icon={<Mail size={19} color={t.c(canMail ? '--color-interactive' : '--color-subtle')} />}
            disabled={!canMail}
            onPress={() => {
              haptics.tick();
              void Linking.openURL(`mailto:${person.email}`);
              void quickLog('email');
            }}
          />
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="xs" weight="600" tone="muted">
              HISTORY
            </Text>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={15} color={t.c('--color-interactive')} />}
              onPress={() => logSheet.current?.open()}
              haptic="none"
            >
              Log
            </Button>
          </View>

          {(timeline ?? []).length === 0 ? (
            <Text variant="sm" tone="subtle" style={{ paddingVertical: 12 }}>
              Nothing logged with {person.name.split(' ')[0]} yet.
            </Text>
          ) : (
            <View
              style={{
                borderRadius: t.radius.md,
                backgroundColor: t.c('--color-surface'),
                borderWidth: 1,
                borderColor: t.c('--color-border'),
                overflow: 'hidden'
              }}
            >
              {(timeline ?? []).map((i, idx) => (
                <View
                  key={i.id}
                  style={{
                    padding: 13,
                    borderTopWidth: idx === 0 ? 0 : 1,
                    borderTopColor: t.c('--color-border')
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text variant="sm" weight="500" numberOfLines={1} style={{ flex: 1 }}>
                      {i.title}
                    </Text>
                    {i.pending ? (
                      <Text variant="2xs" tone="subtle">
                        queued
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="2xs" tone="muted" style={{ marginTop: 2 }}>
                    {TYPE_LABELS[i.type as InteractionType] ?? i.type} · {formatTime(i.occurredAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <LogSheet ref={logSheet} personId={person.id} personName={person.name} />
      <EditPersonSheet ref={editSheet} person={person} />
    </View>
  );
}

function QuickAction({
  label,
  icon,
  onPress,
  disabled
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      press="button"
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={{
        flex: 1,
        height: 62,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        borderRadius: t.radius.md,
        backgroundColor: t.c('--color-surface'),
        borderWidth: 1,
        borderColor: t.c('--color-border'),
        opacity: disabled ? 0.45 : 1
      }}
    >
      {icon}
      <Text variant="2xs" weight="500" tone={disabled ? 'subtle' : 'accent'}>
        {label}
      </Text>
    </Pressable>
  );
}
