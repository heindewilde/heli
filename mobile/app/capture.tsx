import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShareIntent } from 'expo-share-intent';
import { Check, Link2 } from 'lucide-react-native';
import { Text } from '../src/ui/Text';
import { Button } from '../src/ui/Button';
import { Pressable } from '../src/ui/Pressable';
import { useTheme } from '../src/theme';
import { haptics } from '../src/ui/haptics';
import { api } from '../src/api/endpoints';
import { ApiError } from '../src/api/client';
import { domainOf } from '../../src/lib/cleanUrl';
import { resolveShare } from '../src/native/shareIntent';

/**
 * Save a page you are looking at, from anywhere.
 *
 * The mobile answer to the browser extension, and it deliberately reuses the
 * extension's exact server path: `cleanUrl` → `GET /lookup` → `POST /capture`.
 * `cleanUrl` is the *shared module*, not a copy — those rules decide whether two
 * spellings of a LinkedIn URL are the same record, so the phone and the server
 * have to agree exactly or a capture creates a duplicate of someone you already
 * have.
 *
 * The flow is built around one fact: **most shares are of someone already
 * saved.** So the lookup happens first and immediately, and the common outcome
 * is "you have them — opening now" rather than a form.
 */
export default function CaptureScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string }>();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'known' | 'new' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);

  // `resolveShare` owns the parsing, so it can be tested without a device —
  // the share sheet is inconsistent about whether a page arrives as a URL
  // field or as text with a link inside it.
  useEffect(() => {
    const resolved = resolveShare({
      webUrl: params.url ?? shareIntent?.webUrl,
      text: shareIntent?.text
    });
    if (resolved.kind === 'url') setUrl(resolved.url);
    else if (resolved.kind === 'unusable') {
      setUrl(resolved.text);
      setError('That does not look like a web address.');
    }
  }, [params.url, shareIntent?.webUrl, shareIntent?.text]);

  const check = useCallback(async (candidate: string) => {
    setState('checking');
    setError(null);
    try {
      const res = (await api.lookup(candidate)) as { found?: boolean; kind?: string; id?: string };
      if (res.found && res.id) {
        haptics.success();
        setState('known');
        // Straight to the record. The overwhelmingly common case does not
        // deserve a confirmation step.
        if (res.kind === 'company') router.replace(`/company/${res.id}`);
        else router.replace(`/person/${res.id}`);
        return;
      }
      setState('new');
    } catch (err) {
      setState('new');
      if (err instanceof ApiError && err.code === 'offline') {
        setError('Offline — you can still save, and it will sync later.');
      }
    }
  }, [router]);

  useEffect(() => {
    if (url && state === 'idle') void check(url);
  }, [url, state, check]);

  async function save() {
    setState('saving');
    try {
      const res = (await api.capture({
        url,
        name: name.trim() || domainOf(url),
        note: note.trim() || undefined
      })) as { id?: string; kind?: string };

      haptics.success();
      resetShareIntent();
      if (res.kind === 'company' && res.id) router.replace(`/company/${res.id}`);
      else if (res.id) router.replace(`/person/${res.id}`);
      else router.replace('/');
    } catch (err) {
      haptics.error();
      setState('new');
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.c('--color-bg') }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 24,
          gap: 18
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 6 }}>
          <Text variant="2xl" weight="700">
            Save to Heli
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Link2 size={13} color={t.c('--color-subtle')} />
            <Text variant="xs" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
              {url || 'Nothing shared'}
            </Text>
          </View>
        </View>

        {state === 'checking' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 }}>
            <ActivityIndicator color={t.c('--color-subtle')} />
            <Text variant="sm" tone="muted">
              Checking whether you already have this…
            </Text>
          </View>
        ) : state === 'known' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Check size={16} color={t.c('--color-success')} />
            <Text variant="sm" tone="muted">
              You already have this — opening it.
            </Text>
          </View>
        ) : (
          <>
            <View style={{ gap: 7 }}>
              <Text variant="2xs" weight="600" tone="muted">
                NAME
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={url ? domainOf(url) : 'Who or what is this?'}
                placeholderTextColor={t.c('--color-subtle')}
                autoCapitalize="words"
                style={inputStyle(t)}
              />
            </View>

            <View style={{ gap: 7 }}>
              <Text variant="2xs" weight="600" tone="muted">
                NOTE
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Where you met, what they want…"
                placeholderTextColor={t.c('--color-subtle')}
                multiline
                style={{ ...inputStyle(t), height: 96, paddingTop: 13, textAlignVertical: 'top' }}
              />
            </View>

            {error ? (
              <Text variant="xs" tone="danger">
                {error}
              </Text>
            ) : null}

            <Button block size="lg" onPress={save} loading={state === 'saving'} disabled={!url}>
              Save
            </Button>
          </>
        )}

        <Pressable
          press="none"
          onPress={() => {
            resetShareIntent();
            router.replace('/');
          }}
          style={{ alignSelf: 'center', padding: 8 }}
        >
          <Text variant="sm" tone="muted">
            Cancel
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>) {
  return {
    minHeight: 46,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.c('--color-border'),
    backgroundColor: t.c('--color-surface'),
    paddingHorizontal: 13,
    color: t.c('--color-text'),
    fontSize: 16
  } as const;
}

