import { beforeEach, expect, test, vi } from 'vitest';

/**
 * Node environment with a stubbed window — same approach as layerStack's tests.
 * What is worth pinning here is the behaviour the old `bindKeys` could not
 * express: modified chords, multi-key sequences, and the rule about when a
 * shortcut must yield to someone typing.
 */

type Listener = (e: unknown) => void;
const listeners = new Map<string, Set<Listener>>();

vi.stubGlobal('window', {
  addEventListener(type: string, fn: Listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
  },
  removeEventListener(type: string, fn: Listener) {
    listeners.get(type)?.delete(fn);
  }
});
vi.stubGlobal('navigator', { platform: 'MacIntel' });

const { registerCommands, startShortcuts, prettyShortcut, availableCommands, allCommands } =
  await import('./registry.svelte');

type KeyOpts = { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean; typing?: boolean };

function press(key: string, opts: KeyOpts = {}) {
  const target = opts.typing
    ? Object.assign(Object.create(HTMLElement.prototype), { tagName: 'INPUT', isContentEditable: false })
    : null;
  const e = {
    key,
    metaKey: !!opts.meta,
    ctrlKey: !!opts.ctrl,
    altKey: !!opts.alt,
    shiftKey: !!opts.shift,
    target,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    }
  };
  for (const fn of [...(listeners.get('keydown') ?? [])]) fn(e);
  return e;
}

// isTypingTarget checks `instanceof HTMLElement`, which node lacks.
class FakeHTMLElement {
  tagName = 'INPUT';
  isContentEditable = false;
}
vi.stubGlobal('HTMLElement', FakeHTMLElement);

let fired: string[];
let stop: () => void;
let unregister: () => void;

beforeEach(() => {
  fired = [];
  listeners.clear();
  stop?.();
  unregister?.();
  unregister = registerCommands([
    { id: 'palette', title: 'Search', section: 'Navigate', shortcut: 'mod+k', run: () => fired.push('palette') },
    { id: 'help', title: 'Help', section: 'Workspace', shortcut: '?', run: () => fired.push('help') },
    { id: 'people', title: 'People', section: 'Navigate', shortcut: 'g p', run: () => fired.push('people') },
    { id: 'companies', title: 'Companies', section: 'Navigate', shortcut: 'g c', run: () => fired.push('companies') },
    { id: 'newp', title: 'New person', section: 'Create', shortcut: 'n p', run: () => fired.push('newp') },
    { id: 'fav', title: 'Favourite', section: 'This page', shortcut: '*', run: () => fired.push('fav') },
    {
      id: 'gated',
      title: 'Gated',
      section: 'This page',
      shortcut: 'x',
      when: () => false,
      run: () => fired.push('gated')
    }
  ]);
  stop = startShortcuts();
});

test('a plain chord fires and is prevented', () => {
  const e = press('*');
  expect(fired).toEqual(['fav']);
  expect(e.prevented).toBe(true);
});

test('a modified chord fires — the case bindKeys could not express', () => {
  press('k', { meta: true });
  expect(fired).toEqual(['palette']);
});

test('sequences resolve on the second key', () => {
  press('g');
  expect(fired).toEqual([]); // armed, nothing yet
  press('p');
  expect(fired).toEqual(['people']);

  press('g');
  press('c');
  expect(fired).toEqual(['people', 'companies']);
});

test('two different sequence prefixes do not collide', () => {
  press('n');
  press('p');
  expect(fired).toEqual(['newp']);
});

test('an unknown second key cancels the sequence without firing anything', () => {
  press('g');
  press('z');
  expect(fired).toEqual([]);
  // ...and the next key starts fresh rather than continuing the old sequence.
  press('*');
  expect(fired).toEqual(['fav']);
});

test('a `when` guard suppresses the binding entirely', () => {
  const e = press('x');
  expect(fired).toEqual([]);
  expect(e.prevented).toBe(false);
  expect(availableCommands().find((c) => c.id === 'gated')).toBeUndefined();
  // Still present in the registry, so the shortcut sheet can list it.
  expect(allCommands().find((c) => c.id === 'gated')).toBeTruthy();
});

test('typing wins for unmodified keys, but not for modified ones', () => {
  press('*', { typing: true });
  expect(fired).toEqual([]);

  press('k', { meta: true, typing: true });
  expect(fired).toEqual(['palette']);
});

test('typing mid-sequence cancels it', () => {
  press('g');
  press('p', { typing: true });
  expect(fired).toEqual([]);
});

test('bare modifier keys are ignored', () => {
  press('Shift');
  press('Meta');
  expect(fired).toEqual([]);
});

test('re-registering an id replaces rather than duplicates', () => {
  const undo = registerCommands([
    { id: 'fav', title: 'Favourite', section: 'This page', shortcut: '*', run: () => fired.push('fav2') }
  ]);
  press('*');
  expect(fired).toEqual(['fav2']);
  expect(allCommands().filter((c) => c.id === 'fav')).toHaveLength(1);
  undo();
});

test('prettyShortcut renders platform modifiers and sequences', () => {
  expect(prettyShortcut('mod+k')).toEqual(['⌘', 'k']);
  expect(prettyShortcut('g p')).toEqual(['g', 'p']);
  expect(prettyShortcut('Escape')).toEqual(['esc']);
});
