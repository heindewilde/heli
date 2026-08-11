import { capture, getSettings, listTags, lookup, type LookupResult, type Settings } from './api';
import { captureBody, type FormValues, type Parsed } from './capture-body';

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
  // Two calls on purpose. The first runs the bundled parser, whose completion
  // value is lost to esbuild's IIFE wrapper; the second is an inline function,
  // whose *return* value executeScript does deliver.
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => (window as unknown as { __heliCapture?: unknown }).__heliCapture
  });
  if (!result) throw new Error('Could not read this page.');
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
  //
  // `allSettled`, not `all`: only the parse is load-bearing. A lookup that
  // fails — server down, token without the scope, a hiccup — costs the "already
  // saved" banner and nothing else, so it must not take the save form down with
  // it. Same principle the adapters follow one level down: degrade, don't break.
  const [parseResult, lookupResult] = await Promise.allSettled([
    parsePage(tab.id),
    lookup(settings, tab.url)
  ]);

  if (parseResult.status === 'rejected') {
    fail((parseResult.reason as Error).message);
    return;
  }
  const existing: LookupResult =
    lookupResult.status === 'fulfilled' ? lookupResult.value : { found: false, url: tab.url };

  render(settings, parseResult.value, existing);
}

/**
 * Tag suggestions, cached in `chrome.storage.session` — a popup is a fresh
 * document every time it opens, so without this every open refetched them.
 * Session storage dies with the browser, which is the right lifetime for a
 * convenience list; `options.ts` clears it when the token changes, because the
 * tags belong to whichever workspace that token authenticates as.
 */
const TAG_TTL_MS = 5 * 60_000;

async function cachedTags(s: Settings, kind: 'person' | 'company') {
  const key = `tags:${kind}`;
  const cached = (await chrome.storage.session.get(key))[key] as
    | { at: number; tags: { id: string; name: string }[] }
    | undefined;
  if (cached && Date.now() - cached.at < TAG_TTL_MS) return cached.tags;

  const tags = await listTags(s, kind);
  await chrome.storage.session.set({ [key]: { at: Date.now(), tags } });
  return tags;
}

const textarea = (id: string) =>
  (document.getElementById(id) as HTMLTextAreaElement | null)?.value.trim() ?? '';

function readForm(): FormValues {
  return {
    name: val('name'),
    role: val('role'),
    company: val('company'),
    email: val('email'),
    phone: val('phone'),
    location: val('location'),
    bio: textarea('bio'),
    industry: val('industry'),
    description: val('description'),
    tags: val('tags'),
    note: textarea('note')
  };
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

  // The profile photo, shown rather than made editable: seeing what is about to
  // be saved is the useful part, and nobody retypes an image URL.
  if (parsed.avatarUrl) {
    nodes.push(
      el('img', {
        src: parsed.avatarUrl,
        alt: '',
        class: 'avatar',
        width: 40,
        height: 40,
        referrerPolicy: 'no-referrer'
      })
    );
  }

  // Every parsed *text* field is editable before saving — that is the promise
  // that lets a rotted selector degrade to "type it in" instead of to a broken
  // extension. So a field the adapters fill must be rendered *and* sent;
  // `company` was rendered and dropped, and `description` was neither.
  nodes.push(field('Name', existing.found ? existing.name : parsed.name, 'name'));
  if (isPerson) {
    nodes.push(field('Role', parsed.role, 'role'));
    nodes.push(field('Company', parsed.company, 'company'));
    nodes.push(field('Email', parsed.email, 'email'));
    nodes.push(field('Phone', parsed.phone, 'phone'));
  } else {
    nodes.push(field('Industry', parsed.industry, 'industry'));
    nodes.push(field('Description', parsed.description, 'description'));
  }
  nodes.push(field('Location', parsed.location, 'location'));

  if (isPerson) {
    const bio = el('textarea', { id: 'bio', rows: 2 });
    bio.value = parsed.bio ?? '';
    nodes.push(el('label', {}, el('span', {}, 'Bio'), bio));
  }

  nodes.push(field('Tags', '', 'tags'));

  const note = el('textarea', { id: 'note', rows: 3, placeholder: 'Add a note…' });
  nodes.push(el('label', {}, el('span', {}, 'Note'), note));

  const save = el('button', { class: 'primary' }, existing.found ? 'Update' : 'Save to Heli');
  const status = el('span', { class: 'muted', id: 'status' });
  nodes.push(el('div', { class: 'row' }, save, status));

  show(...nodes);

  cachedTags(settings, parsed.kind)
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
      const result = await capture(settings, captureBody(parsed, readForm()));
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
