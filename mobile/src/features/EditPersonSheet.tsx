import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Sheet, type SheetRef } from '../ui/Sheet';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { useTheme } from '../theme';
import { haptics } from '../ui/haptics';
import { patchPerson } from '../db/sync';
import type { PersonRow } from '../db/cache';

/**
 * Edit the fields a phone is actually used to fix.
 *
 * Name, role, email, phone — the four that are wrong or missing when you meet
 * someone and discover the record from a capture has half of it. Notes,
 * statuses, tags and the company link stay on the web, where there is room and
 * where the rich-text editor lives.
 *
 * Saving is optimistic through the same `patchPerson` the swipe actions use, so
 * the sheet closes immediately and the outbox reconciles. Only fields that
 * actually changed are sent: a PATCH carrying four unchanged values would
 * clobber a concurrent edit from the web for no reason.
 */

export type EditPersonSheetRef = { open: () => void };

export const EditPersonSheet = forwardRef<EditPersonSheetRef, { person: PersonRow }>(
  function EditPersonSheet({ person }, ref) {
    const t = useTheme();
    const sheet = useRef<SheetRef>(null);

    const [name, setName] = useState(person.name);
    const [role, setRole] = useState(person.role ?? '');
    const [email, setEmail] = useState(person.email ?? '');
    const [phone, setPhone] = useState(person.phone ?? '');

    useImperativeHandle(ref, () => ({
      open: () => {
        // Re-seed from the record each time it opens, so an edit made on the
        // web since this screen mounted is not silently overwritten by stale
        // values sitting in the form.
        setName(person.name);
        setRole(person.role ?? '');
        setEmail(person.email ?? '');
        setPhone(person.phone ?? '');
        sheet.current?.open();
      }
    }));

    async function save() {
      const local: Record<string, unknown> = {};
      const remote: Record<string, unknown> = {};

      const changed = (column: string, field: string, next: string, before: string | null) => {
        const value = next.trim() || null;
        if (value === (before ?? null)) return;
        local[column] = value;
        remote[field] = value;
      };

      // `name` is required by the server, so an emptied field keeps the old one
      // rather than failing the write after the sheet has closed.
      if (name.trim() && name.trim() !== person.name) {
        local.name = name.trim();
        remote.name = name.trim();
      }
      changed('role', 'role', role, person.role);
      changed('email', 'email', email, person.email);
      changed('phone', 'phone', phone, person.phone);

      sheet.current?.close();
      if (Object.keys(local).length === 0) return;

      haptics.success();
      await patchPerson(person.id, local, remote);
    }

    return (
      <Sheet ref={sheet} title="Edit details" snapPoints={['62%', '92%']}>
        <View style={{ padding: 20, gap: 14 }}>
          <Field label="NAME" value={name} onChange={setName} autoCapitalize="words" />
          <Field label="ROLE" value={role} onChange={setRole} placeholder="Head of Design" />
          <Field
            label="EMAIL"
            value={email}
            onChange={setEmail}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="PHONE"
            value={phone}
            onChange={setPhone}
            placeholder="+31 6 12345678"
            // `phone-pad` rather than `number-pad`: international numbers have
            // a +, and a keypad without one is a small trap.
            keyboardType="phone-pad"
          />

          <Button block size="lg" onPress={save} haptic="none">
            Save
          </Button>
          <Text variant="2xs" tone="subtle" style={{ textAlign: 'center' }}>
            Notes, tags and the company link are on the web.
          </Text>
        </View>
      </Sheet>
    );
  }
);

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  autoCapitalize
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'words';
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="2xs" weight="600" tone="muted">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.c('--color-subtle')}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
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
    </View>
  );
}
