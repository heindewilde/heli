import { getSettings, saveSettings, whoami } from './api';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const originEl = $<HTMLInputElement>('origin');
const tokenEl = $<HTMLInputElement>('token');
const statusEl = $<HTMLElement>('status');

getSettings().then((s) => {
  if (!s) return;
  originEl.value = s.origin;
  tokenEl.value = s.token;
});

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
    const scopes = me.scopes ?? [];
    statusEl.textContent = scopes.includes('capture') || scopes.includes('write')
      ? `Connected to ${me.workspace.name ?? 'your workspace'}.`
      : 'Connected, but this token lacks the capture scope.';
  } catch (err) {
    statusEl.textContent = (err as Error).message;
  }
});
