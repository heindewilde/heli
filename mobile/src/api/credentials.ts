import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * The server URL and the device token are one credential, and are stored as one
 * record.
 *
 * A token is only meaningful against the instance that minted it: Heli is
 * self-hostable, so the same app may be pointed at `heli.so`, a VPS, or a
 * laptop on the LAN. Storing them separately invites a state where the app has
 * a token for one origin and a URL for another, which fails as a 401 that looks
 * like an expired session.
 *
 * SecureStore, not AsyncStorage: this is Keychain on iOS and Keystore on
 * Android. A bearer credential that grants full read/write to someone's CRM
 * does not belong in a plaintext key-value file.
 */

const KEY = 'heli.credential.v1';

/**
 * `expo-secure-store` has no web implementation and throws there.
 *
 * That matters because `expo start --web` is a real development surface, and
 * the failure was worse than "unsupported": the pairing request *succeeded*,
 * the server created a device and consumed the single-use code, and only then
 * did storage throw — so the app reported "Could not connect" for a pairing
 * that had actually happened, and the code could not be reused to try again.
 *
 * **localStorage is not secure storage**, and this is deliberately web-only.
 * The Keychain and Keystore are the whole reason a bearer credential is safe to
 * keep on a device; a browser tab has no equivalent, and pretending otherwise
 * by using this on native would be a real downgrade. `Platform.OS === 'web'` is
 * the guard, and it is not a preference.
 */
const web = Platform.OS === 'web';

const store = {
  async get(key: string): Promise<string | null> {
    return web ? globalThis.localStorage?.getItem(key) ?? null : SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (web) globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (web) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  }
};

export type Credential = {
  /** Origin only, no trailing slash — e.g. `https://heli.so`. */
  server: string;
  token: string;
  userId: string;
  /** Which workspace the app is currently showing. Sent as X-Heli-Workspace. */
  workspaceId: string | null;
};

let cached: Credential | null | undefined;

/**
 * Who to tell when the credential appears or disappears.
 *
 * The root layout decides between the pairing screen and the tabs, and it used
 * to read the credential once at mount. That is wrong the moment pairing
 * succeeds: the pair screen saved a token and navigated to `/`, the gate still
 * believed there was none, and it redirected straight back — so a *successful*
 * pairing landed you on the pairing screen, which reads as a failure.
 *
 * A listener rather than polling, because the two events that matter are both
 * things this module already does.
 */
type Listener = (credential: Credential | null) => void;
const listeners = new Set<Listener>();

export function onCredentialChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function announce(credential: Credential | null): void {
  for (const fn of listeners) fn(credential);
}

export async function loadCredential(): Promise<Credential | null> {
  if (cached !== undefined) return cached;
  const raw = await store.get(KEY);
  cached = raw ? (JSON.parse(raw) as Credential) : null;
  return cached;
}

export async function saveCredential(c: Credential): Promise<void> {
  const first = !cached;
  cached = c;
  await store.set(KEY, JSON.stringify(c));
  // Only on appearing, not on every workspace echo — the gate cares about
  // "is there a credential", and announcing each header update would churn it.
  if (first) announce(c);
}

export async function clearCredential(): Promise<void> {
  cached = null;
  await store.remove(KEY);
  announce(null);
}

/**
 * Normalise what someone typed into an origin.
 *
 * `http://` is allowed on purpose — a LAN self-host is plain HTTP, which is the
 * same reality `src/lib/client/clipboard.ts` exists for on the web. iOS permits
 * it through `NSAllowsLocalNetworking` in app.config.ts.
 */
export function normalizeServer(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}
