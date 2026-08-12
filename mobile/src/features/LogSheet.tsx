import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Sheet, type SheetRef } from '../ui/Sheet';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Pressable } from '../ui/Pressable';
import { useTheme } from '../theme';
import { haptics } from '../ui/haptics';
import { logInteraction } from '../db/sync';
import { INTERACTION_TYPES, type InteractionType } from '../../../src/lib/interactionTypes';
import { TYPE_LABELS } from '../../../src/lib/interactionMeta';

/**
 * Log what just happened.
 *
 * The web equivalent is a full page with a project picker, an attendee
 * multi-select and a date-time field. This is the same act stripped to what
 * someone does in the thirty seconds after a call ends: pick a type, say what
 * it was, done. Everything else defaults — now, this person — and can be
 * corrected later on a larger screen.
 *
 * That is the difference between mobile-first and a port. The port would show
 * six fields and a save button; this shows two and saves optimistically, so the
 * interaction is in the timeline before the sheet has finished closing.
 */

export type LogSheetRef = { open: () => void };

export const LogSheet = forwardRef<
  LogSheetRef,
  { personId?: string; personName?: string; onLogged?: () => void }
>(function LogSheet({ personId, personName }, ref) {
  const t = useTheme();
  const sheet = useRef<SheetRef>(null);
  const [type, setType] = useState<InteractionType>('call');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  useImperativeHandle(ref, () => ({
    open: () => {
      // Reset on open, not on close: someone who dismisses by accident and
      // reopens expects what they typed to still be there.
      sheet.current?.open();
    }
  }));

  async function save() {
    const label = TYPE_LABELS[type];
    haptics.success();
    sheet.current?.close();

    // Fire and forget into the outbox. The row appears immediately and the
    // request happens behind it — a spinner here would be waiting for a
    // network round trip to show something already decided.
    await logInteraction({
      type,
      title: title.trim() || `${label}${personName ? ` with ${personName}` : ''}`,
      body: note.trim() || null,
      personId,
      personName
    });

    setTitle('');
    setNote('');
  }

  return (
    <Sheet ref={sheet} title={personName ? `Log with ${personName}` : 'Log an interaction'} snapPoints={['58%', '90%']}>
      <View style={{ padding: 20, gap: 18 }}>
        <View style={{ gap: 9 }}>
          <Text variant="2xs" weight="600" tone="muted">
            TYPE
          </Text>
          {/* Chips rather than a picker: seven options is few enough to show,
              and one tap beats opening a wheel to choose between them. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {INTERACTION_TYPES.map((k) => {
              const active = k === type;
              return (
                <Pressable
                  key={k}
                  press="button"
                  haptic
                  onPress={() => setType(k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={{
                    paddingHorizontal: 14,
                    height: 38,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 19,
                    backgroundColor: active ? t.c('--color-accent') : t.c('--color-surface-2'),
                    borderWidth: 1,
                    borderColor: active ? t.c('--color-accent') : t.c('--color-border')
                  }}
                >
                  <Text variant="sm" weight="500" tone={active ? 'inverse' : 'default'}>
                    {TYPE_LABELS[k]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="2xs" weight="600" tone="muted">
            WHAT HAPPENED
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={`${TYPE_LABELS[type]}${personName ? ` with ${personName}` : ''}`}
            placeholderTextColor={t.c('--color-subtle')}
            style={{
              height: 46,
              borderRadius: t.radius.md,
              borderWidth: 1,
              borderColor: t.c('--color-border'),
              backgroundColor: t.c('--color-bg'),
              paddingHorizontal: 13,
              color: t.c('--color-text'),
              fontSize: 16
            }}
          />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Notes (optional)"
            placeholderTextColor={t.c('--color-subtle')}
            multiline
            style={{
              minHeight: 88,
              borderRadius: t.radius.md,
              borderWidth: 1,
              borderColor: t.c('--color-border'),
              backgroundColor: t.c('--color-bg'),
              padding: 13,
              color: t.c('--color-text'),
              fontSize: 16,
              textAlignVertical: 'top'
            }}
          />
        </View>

        <Button block size="lg" onPress={save} haptic="none">
          Log it
        </Button>
      </View>
    </Sheet>
  );
});
