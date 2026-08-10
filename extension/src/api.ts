/**
 * Talking to Heli.
 *
 * The session cookie is `SameSite=Lax`, so a cross-origin fetch from
 * `chrome-extension://…` will never carry it. That is not an inconvenience to
 * work around — it is the reason personal access tokens exist. One paste, once,
 * in the options page.
 */

export type Settings = { origin: string; token: string };

export async function getSettings(): Promise<Settings | null> {
  const { origin, token } = await chrome.storage.local.get(['origin', 'token']);
  if (!origin || !token) return null;
  return { origin: String(origin).replace(/\/$/, ''), token: String(token) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ origin: s.origin.replace(/\/$/, ''), token: s.token });
}

async function call<T>(s: Settings, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${s.origin}/api/v1${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${s.token}`,
      ...(init?.headers ?? {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return body.data as T;
}

export type LookupResult =
  | { found: false; url: string }
  | { found: true; kind: 'person' | 'company'; id: string; name: string; updatedAt: number; url: string };

export const lookup = (s: Settings, url: string) =>
  call<LookupResult>(s, `/lookup?url=${encodeURIComponent(url)}`);

export const listTags = (s: Settings, scope: 'person' | 'company') =>
  call<{ id: string; name: string }[]>(s, `/tags?scope=${scope}`);

export const capture = (s: Settings, body: Record<string, unknown>) =>
  call<{ id: string; kind: string; dedup: boolean; href: string }>(s, '/capture', {
    method: 'POST',
    body: JSON.stringify(body)
  });

export const whoami = (s: Settings) =>
  call<{ workspace: { name: string | null }; scopes: string[] | null }>(s, '/me');
