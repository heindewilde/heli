import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../src/theme';
import { loadCredential } from '../src/api/credentials';
import { setSignedOutHandler } from '../src/api/client';
import { startReplayer } from '../src/db/sync';
import '../global.css';

/**
 * The root.
 *
 * Two things happen here and nowhere else: the credential is resolved before
 * anything renders, and the outbox replayer is started for the life of the app.
 *
 * The gate is deliberately *not* a loading screen. Reading the Keychain takes a
 * few milliseconds, so showing a spinner for it produces a flash of chrome that
 * is worse than showing nothing — the native splash stays up instead, and the
 * first painted frame is already the right screen.
 */
function Root() {
  const t = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);
  const [paired, setPaired] = useState(false);

  useEffect(() => {
    loadCredential()
      .then((c) => setPaired(!!c))
      .finally(() => setReady(true));
    return startReplayer();
  }, []);

  // A 401 anywhere wipes the credential; this is what turns that into a
  // navigation rather than a screen full of failed requests.
  useEffect(() => setSignedOutHandler(() => setPaired(false)), []);

  useEffect(() => {
    if (!ready) return;
    const onPairing = segments[0] === 'pair';
    if (!paired && !onPairing) router.replace('/pair');
    if (paired && onPairing) router.replace('/');
  }, [ready, paired, segments, router]);

  return (
    <>
      <StatusBar style={t.name === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          // The platform's own push transition. Reimplementing it is how an app
          // ends up feeling almost-right — the edge-swipe-back gesture and its
          // interruptibility come free only if the native animator drives it.
          animation: 'default',
          contentStyle: { backgroundColor: t.c('--color-bg') }
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Root />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
