import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Check } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Pressable } from '../ui/Pressable';
import { useTheme } from '../theme';
import { haptics } from '../ui/haptics';
import { api } from '../api/endpoints';
import { ApiError } from '../api/client';
import { registerForPush } from '../native/push';

/**
 * What you asked to be reminded about.
 *
 * The section that most justifies the app existing: reminders on the web live
 * in a sidebar popover you have to remember to open, which is the wrong shape
 * for something time-based. Here they are the first thing on the first screen,
 * and — once notifications are on — they arrive without the app being opened at
 * all.
 *
 * Overdue is called out rather than merely sorted first. "Yesterday" in muted
 * grey reads as history; the same row in amber reads as something you dropped.
 */

type Reminder = {
  id: string;
  kind: string;
  refId: string;
  refLabel: string | null;
  refHref: string | null;
  remindAt: number;
};

export function Reminders() {
  const t = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<Reminder[] | null>(null);
  const [pushState, setPushState] = useState<'unknown' | 'on' | 'off'>('unknown');

  const load = useCallback(async () => {
    try {
      const rows = (await api.reminders()) as unknown as Reminder[];
      // Only what is due or nearly due. A reminder three weeks out is not
      // something to look at today, and a list that shows everything is a list
      // nobody reads.
      const horizon = Date.now() + 36 * 3600 * 1000;
      setItems(rows.filter((r) => r.remindAt <= horizon).slice(0, 8));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'offline') setItems([]);
      else setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dismiss = useCallback(
    async (r: Reminder) => {
      haptics.success();
      setItems((prev) => (prev ?? []).filter((x) => x.id !== r.id));
      await api.deleteReminder(r.id).catch(() => void load());
    },
    [load]
  );

  const enablePush = useCallback(async () => {
    const result = await registerForPush();
    setPushState(result === 'granted' ? 'on' : 'off');
    if (result === 'granted') haptics.success();
  }, []);

  if (!items || items.length === 0) return null;

  const overdue = items.filter((r) => r.remindAt <= Date.now()).length;

  return (
    <View style={{ marginTop: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 7
        }}
      >
        <Bell size={14} color={overdue ? t.c('--color-warning') : t.c('--color-subtle')} />
        <Text variant="xs" weight="600" tone="muted" style={{ flex: 1 }}>
          {overdue > 0 ? `${overdue} due now` : 'Coming up'}
        </Text>
        {pushState !== 'on' ? (
          // Asked here, at the moment reminders are visibly relevant — never at
          // launch, where the honest answer to a prompt about an app you have
          // not used yet is no, and iOS only lets you ask once.
          <Pressable press="none" onPress={enablePush} hitSlop={10}>
            <Text variant="2xs" weight="600" tone="accent">
              Notify me
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={{
          marginHorizontal: 16,
          borderRadius: t.radius.md,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: t.c('--color-border')
        }}
      >
        {items.map((r, idx) => {
          const late = r.remindAt <= Date.now();
          return (
            <Pressable
              key={r.id}
              press="row"
              onPress={() => {
                if (r.kind === 'person') router.push(`/person/${r.refId}`);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 13,
                paddingVertical: 12,
                backgroundColor: late ? t.c('--color-warning-bg') : t.c('--color-surface'),
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: t.c('--color-border')
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="sm" weight="500" numberOfLines={1}>
                  {r.refLabel ?? 'A record'}
                </Text>
                <Text variant="2xs" tone={late ? 'danger' : 'muted'}>
                  {relative(r.remindAt)}
                </Text>
              </View>
              <Pressable
                press="button"
                onPress={() => dismiss(r)}
                accessibilityLabel="Dismiss reminder"
                hitSlop={10}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: t.c('--color-surface-2')
                }}
              >
                <Check size={15} color={t.c('--color-muted')} strokeWidth={2.5} />
              </Pressable>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** "in 2h", "3h ago", "tomorrow" — the granularity someone actually acts on. */
function relative(ts: number): string {
  const diff = ts - Date.now();
  const mins = Math.round(Math.abs(diff) / 60000);
  const ago = diff < 0;

  if (mins < 1) return 'now';
  if (mins < 60) return ago ? `${mins}m ago` : `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return ago ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return ago ? 'yesterday' : 'tomorrow';
  return ago ? `${days}d ago` : `in ${days}d`;
}
