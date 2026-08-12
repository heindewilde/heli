import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Application from 'expo-application';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../src/ui/Text';
import { Button } from '../src/ui/Button';
import { useTheme } from '../src/theme';
import { haptics } from '../src/ui/haptics';
import { claimPairing, checkServer, ApiError } from '../src/api/client';
import { normalizeServer, saveCredential } from '../src/api/credentials';
import { APP_NAME } from '../../src/lib/branding';

/**
 * First run.
 *
 * The whole screen is built around one idea: **most people should never see the
 * server field.** The QR carries the origin, so scanning it fills in both
 * halves and the only thing anyone types is nothing at all. The manual path
 * exists for the times the camera is not an option, and it is deliberately
 * secondary rather than the default a self-hosted app usually leads with.
 *
 * The code input is the interesting part. It is a Crockford base32 code read
 * off a screen, so:
 *   - `autoCapitalize="characters"` and a monospace face, because the code is
 *     shown grouped and uppercase and the field should agree;
 *   - hyphens and spaces are accepted and stripped, because people type what
 *     they see;
 *   - `normalizeCode` on the server folds I/L→1 and O→0, so the two glyph pairs
 *     that actually get misread are not an error at all.
 */
export default function PairScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [server, setServer] = useState('https://heli.so');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    const origin = normalizeServer(server);
    if (!origin) {
      setError('That does not look like a web address.');
      haptics.error();
      return;
    }

    setBusy(true);
    try {
      // Probe first, so "wrong address" and "wrong code" are different
      // messages. Being told a valid code is invalid because the URL had a typo
      // is the kind of dead end people give up at.
      if (!(await checkServer(origin))) {
        setError(`No Heli server answered at ${origin}.`);
        haptics.error();
        return;
      }

      const result = await claimPairing(origin, code, {
        name:
          Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Browser',
        platform: Platform.OS,
        appVersion: Application.nativeApplicationVersion ?? '0.1.0'
      });

      await saveCredential({
        server: origin,
        token: result.token,
        userId: '',
        workspaceId: result.defaultWorkspaceId
      });
      haptics.success();
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not connect.');
      haptics.error();
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.c('--color-bg') }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: 28,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          gap: 22
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 8, alignItems: 'center' }}>
          <Text style={{ fontSize: 44 }}>🚁</Text>
          <Text variant="2xl" weight="700">
            {APP_NAME}
          </Text>
          <Text tone="muted" variant="sm" style={{ textAlign: 'center' }}>
            Open {APP_NAME} on your computer, go to Settings → Devices, and pair this phone.
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="xs" weight="600" tone="muted">
            PAIRING CODE
          </Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v)}
            placeholder="eu-ABCDE-FGHJK"
            placeholderTextColor={t.c('--color-subtle')}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            returnKeyType="go"
            onSubmitEditing={connect}
            style={{
              height: 54,
              borderRadius: t.radius.md,
              borderWidth: 1,
              borderColor: t.c('--color-border'),
              backgroundColor: t.c('--color-surface'),
              paddingHorizontal: 16,
              color: t.c('--color-text'),
              fontSize: 19,
              letterSpacing: 1.5,
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
            }}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="xs" weight="600" tone="muted">
            SERVER
          </Text>
          <TextInput
            value={server}
            onChangeText={setServer}
            placeholder="https://heli.so"
            placeholderTextColor={t.c('--color-subtle')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={{
              height: 48,
              borderRadius: t.radius.md,
              borderWidth: 1,
              borderColor: t.c('--color-border'),
              backgroundColor: t.c('--color-surface'),
              paddingHorizontal: 16,
              color: t.c('--color-text'),
              fontSize: 16
            }}
          />
          <Text variant="2xs" tone="subtle">
            Leave this as it is unless you host {APP_NAME} yourself.
          </Text>
        </View>

        {error ? (
          <View
            style={{
              padding: 12,
              borderRadius: t.radius.md,
              backgroundColor: t.c('--color-danger-bg'),
              borderWidth: 1,
              borderColor: t.c('--color-danger-border')
            }}
          >
            <Text variant="sm" tone="danger">
              {error}
            </Text>
          </View>
        ) : null}

        <Button block size="lg" onPress={connect} loading={busy} disabled={code.trim().length < 5}>
          Connect
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
