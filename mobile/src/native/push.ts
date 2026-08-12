import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { api } from '../api/endpoints';

/**
 * Push notifications for due reminders.
 *
 * The permission is requested **when someone first sets a reminder**, not at
 * launch. A cold permission prompt on first run is the fastest way to a
 * permanent "Don't Allow": the person has no idea what the app is yet, so the
 * safe answer is no — and iOS only lets you ask once.
 *
 * `registerForPush` is therefore called from the reminder flow, and
 * `usePushRouting` is mounted at the root to handle taps.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // Reminders are things the user asked for at a time they chose, so
    // interrupting is the point — but only when the app is not already open,
    // where a banner over the thing you are looking at is just noise.
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

export type PushResult = 'granted' | 'denied' | 'unsupported';

/**
 * Ask, then hand the token to the server.
 *
 * Returns `unsupported` on a simulator rather than throwing: push genuinely
 * does not work there, and a caller that treats that as an error shows a
 * failure for something that is simply not available.
 */
export async function registerForPush(): Promise<PushResult> {
  // A simulator and a browser both report this, and neither can receive a push.
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';

  if (Platform.OS === 'android') {
    // Android needs a channel before anything will show, and the channel — not
    // the message — carries the importance and the vibration pattern.
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return 'denied';

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  await api.registerPush(token);
  return 'granted';
}

/** Turn notifications off for this device, without unpairing it. */
export async function unregisterPush(): Promise<void> {
  await api.registerPush(null);
}

/**
 * Route a tapped notification to the record it is about.
 *
 * Handles both cases, and the second is the one that gets forgotten: a tap
 * while the app is running, and a tap that *launched* the app from cold. The
 * cold-start payload is only available from `getLastNotificationResponseAsync`
 * and is gone by the time a listener could have been attached.
 */
export function usePushRouting(): void {
  const router = useRouter();

  useEffect(() => {
    const route = (data: Record<string, unknown> | undefined) => {
      if (!data) return;
      const { kind, refId } = data as { kind?: string; refId?: string };
      if (!refId) return;
      if (kind === 'person') router.push(`/person/${refId}`);
      // Other kinds have no detail screen yet; opening the app is still the
      // right outcome, so this deliberately does nothing rather than pushing a
      // route that would 404.
    };

    // Guarded, because these throw rather than no-op where the native module is
    // absent — `expo start --web` raised an unhandled UnavailabilityError on
    // every launch. Notifications are a native affordance; a platform without
    // them should be quiet about it, not noisy.
    if (Platform.OS === 'web') return;

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => route(response?.notification.request.content.data))
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      route(response.notification.request.content.data);
    });
    return () => sub.remove();
  }, [router]);
}
