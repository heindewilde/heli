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

export type Credential = {
  /** Origin only, no trailing slash — e.g. `https://heli.so`. */
  server: string;
  token: string;
  userId: string;
  /** Which workspace the app is currently showing. Sent as X-Heli-Workspace. */
  workspaceId: string | null;
};

let cached: Credential | null | undefined;

export async function loadCredential(): Promise<Credential | null> {
  if (cached !== undefined) return cached;
  const raw = await SecureStore.getItemAsync(KEY);
  cached = raw ? (JSON.parse(raw) as Credential) : null;
  return cached;
}

export async function saveCredential(c: Credential): Promise<void> {
  cached = c;
  await SecureStore.setItemAsync(KEY, JSON.stringify(c));
}

export async function clearCredential(): Promise<void> {
  cached = null;
  await SecureStore.deleteItemAsync(KEY);
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
