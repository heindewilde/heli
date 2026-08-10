import { capture, getSettings, listTags, lookup, type LookupResult, type Settings } from './api';
import type { Capture } from './adapters';

/**
 * The popup.
 *
 * Vanilla DOM, no framework. The whole thing is one form; pulling Svelte in
 * would mean a second Svelte version, a second Tailwind pipeline and two theme
 * systems to keep in sync, for a page with four inputs.
 *
 * Flow: inject the content script and call `/lookup` *in parallel*, so the
 * "already saved" answer is ready at the same time as the parse. Then one
 * `POST /capture` carries the record, its tags and the note together — no fan
 * out, no partial failures to reconcile.
 */

type Parsed = Capture & { url: string; adapter: string };

const app = document.getElementById('app')!;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  for (const c of children) node.append(c);
  return node;
};

function show(...nodes: (Node | string)[]) {
  app.replaceChildren(...nodes);
}

function fail(message: string, action?: { label: string; run: () => void }) {
  const nodes: (Node | string)[] = [el('p', { class: 'error' }, message)];
  if (action) {
    const b = el('button', { class: 'primary' }, action.label);
    b.addEventListener('click', action.run);
    nodes.push(b);
  }
  show(...nodes);
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function parsePage(tabId: number): Promise<Parsed> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
  return result as Parsed;
}

function field(label: string, value: string | null | undefined, id: string): HTMLElement {
  const input = el('input', { id, value: value ?? '', type: 'text' });
  return el('label', {}, el('span', {}, label), input);
}

const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? '';

async function main() {
  const settings = await getSettings();
  if (!settings) {
    fail('Heli is not connected yet.', {
      label: 'Open settings',
      run: () => chrome.runtime.openOptionsPage()
    });
    return;
  }

  const tab = await activeTab();
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    fail('There is nothing to save on this page.');
    return;
  }

  // Parse and lookup concurrently — the lookup does not depend on the parse,
  // and waiting for both in series is the difference between the popup feeling
  // instant and feeling like a network call.
  let parsed: Parsed;
  let existing: LookupResult;
  try {
    [parsed, existing] = await Promise.all([parsePage(tab.id), lookup(settings, tab.url)]);
  } catch (err) {
    fail((err as Error).message);
    return;
  }

  render(settings, parsed, existing);
}

function render(settings: Settings, parsed: Parsed, existing: LookupResult) {
  const isPerson = parsed.kind === 'person';
  const nodes: (Node | string)[] = [];

  if (existing.found) {
    const days = Math.floor((Date.now() - existing.updatedAt) / 86_400_000);
    nodes.push(
      el(
        'p',
        { class: 'known' },
        `Already in Heli · updated ${days === 0 ? 'today' : `${days}d ago`}`
      )
    );
  }

  nodes.push(field('Name', existing.found ? existing.name : parsed.name, 'name'));
  if (isPerson) {
    nodes.push(field('Role', parsed.role, 'role'));
    nodes.push(field('Company', parsed.company, 'company'));
    nodes.push(field('Email', parsed.email, 'email'));
  } else {
    nodes.push(field('Industry', parsed.industry, 'industry'));
  }
  nodes.push(field('Location', parsed.location, 'location'));
  nodes.push(field('Tags', '', 'tags'));

  const note = el('textarea', { id: 'note', rows: 3, placeholder: 'Add a note…' });
  nodes.push(el('label', {}, el('span', {}, 'Note'), note));

  const save = el('button', { class: 'primary' }, existing.found ? 'Update' : 'Save to Heli');
  const status = el('span', { class: 'muted', id: 'status' });
  nodes.push(el('div', { class: 'row' }, save, status));

  show(...nodes);

  // Tag suggestions, cached for the session so opening the popup repeatedly on
  // a page does not re-fetch them.
  listTags(settings, parsed.kind)
    .then((tags) => {
      const list = el('datalist', { id: 'tag-options' });
      for (const t of tags) list.append(el('option', { value: t.name }));
      document.body.append(list);
      (document.getElementById('tags') as HTMLInputElement).setAttribute('list', 'tag-options');
    })
    .catch(() => {
      // Suggestions are a nicety; typing a new tag still works.
    });

  save.addEventListener('click', async () => {
    save.disabled = true;
    status.textContent = 'Saving…';
    try {
      const result = await capture(settings, {
        url: parsed.url,
        kind: parsed.kind,
        name: val('name'),
        role: val('role') || null,
        email: val('email') || null,
        location: val('location') || null,
        industry: val('industry') || null,
        tags: val('tags')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        note: (document.getElementById('note') as HTMLTextAreaElement).value.trim() || null
      });
      status.textContent = 'Saved ✓';
      const open = el('a', {
        href: `${settings.origin}${result.href}`,
        target: '_blank',
        class: 'muted'
      }, 'Open in Heli');
      status.after(open);
      setTimeout(() => window.close(), 1200);
    } catch (err) {
      save.disabled = false;
      status.textContent = (err as Error).message;
    }
  });

  (document.getElementById('name') as HTMLInputElement)?.focus();
}

main();
