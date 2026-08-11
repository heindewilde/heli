import { getSettings, saveSettings, whoami } from './api';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const originEl = $<HTMLInputElement>('origin');
const tokenEl = $<HTMLInputElement>('token');
const statusEl = $<HTMLElement>('status');

// Shown unconditionally, not just on failure: a self-hoster needs this string
// before the first attempt can succeed, and it is not discoverable anywhere
// else without opening chrome://extensions.
$('own-origin').textContent = `chrome-extension://${chrome.runtime.id}`;

getSettings().then((s) => {
  if (!s) return;
  originEl.value = s.origin;
  tokenEl.value = s.token;
});

/**
 * A cross-origin block and an unreachable host are the same `TypeError` here —
 * `fetch` reports "Failed to fetch" for both and deliberately tells a page
 * nothing more. That message on its own sends someone hunting for a typo in
 * their token, so name the likelier cause instead.
 */
function describe(err: unknown): string {
  if (err instanceof TypeError) {
    return `Could not reach that address. If it is right, your server may be refusing cross-origin requests — set EXTENSION_ORIGINS=chrome-extension://${chrome.runtime.id} and restart it.`;
  }
  return (err as Error).message;
}

$('save').addEventListener('click', async () => {
  const origin = originEl.value.trim();
  const token = tokenEl.value.trim();
  if (!origin || !token) {
    statusEl.textContent = 'Both fields are required.';
    return;
  }
  statusEl.textContent = 'Checking…';
  try {
    // Verify before storing, so a typo surfaces here rather than as a mystery
    // failure on the first capture.
    const me = await whoami({ origin, token });
    await saveSettings({ origin, token });
    // Tag suggestions are cached per kind, not per workspace, and a token is
    // what decides which workspace we are in. Changing it must not leave
    // another workspace's tag names sitting in the datalist.
    await chrome.storage.session.clear();
    const scopes = me.scopes ?? [];
    statusEl.textContent = scopes.includes('capture') || scopes.includes('write')
      ? `Connected to ${me.workspace.name ?? 'your workspace'}.`
      : 'Connected, but this token lacks the capture scope.';
  } catch (err) {
    statusEl.textContent = describe(err);
  }
});
