import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Node environment, no jsdom — the tests stay server-side-only per the project's
 * testing decision. `layerStack` only ever touches `window.addEventListener`
 * and `Node.contains`, both of which a twenty-line stub covers, and the part
 * worth testing is the *ordering*, which is pure logic over injected events.
 */

type Listener = (e: unknown) => void;

const listeners = new Map<string, Set<Listener>>();

const fakeWindow = {
  addEventListener(type: string, fn: Listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
  },
  removeEventListener(type: string, fn: Listener) {
    listeners.get(type)?.delete(fn);
  }
};

function dispatch(type: string, event: unknown) {
  for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
}

function listenerCount() {
  return [...listeners.values()].reduce((n, s) => n + s.size, 0);
}

/** A stand-in for a DOM subtree: `contains` is all layerStack asks of it. */
function node(name: string, children: string[] = []) {
  const own = new Set([name, ...children]);
  return { name, contains: (t: unknown) => own.has(t as string) };
}

vi.stubGlobal('window', fakeWindow);

const { pushLayer, layerDepth } = await import('./layerStack');

beforeEach(() => {
  listeners.clear();
});

describe('Escape', () => {
  test('dismisses only the topmost layer', () => {
    const closed: string[] = [];
    const outer = pushLayer({ contains: node('dialog').contains, onDismiss: () => closed.push('dialog') });
    const inner = pushLayer({ contains: node('menu').contains, onDismiss: () => closed.push('menu') });

    dispatch('keydown', { key: 'Escape', stopPropagation() {} });
    // The old `dismiss` action attached a handler per call site, so one Escape
    // closed every listening popover at once. This is the regression test.
    expect(closed).toEqual(['menu']);

    inner.release();
    dispatch('keydown', { key: 'Escape', stopPropagation() {} });
    expect(closed).toEqual(['menu', 'dialog']);

    outer.release();
  });

  test('ignores other keys', () => {
    const closed: string[] = [];
    const h = pushLayer({ contains: () => false, onDismiss: () => closed.push('x') });
    dispatch('keydown', { key: 'a', stopPropagation() {} });
    dispatch('keydown', { key: 'Enter', stopPropagation() {} });
    expect(closed).toEqual([]);
    h.release();
  });
});

describe('pointer press', () => {
  test('a press inside the top layer closes nothing', () => {
    const closed: string[] = [];
    const h = pushLayer({ contains: node('menu', ['menu-item']).contains, onDismiss: () => closed.push('menu') });
    dispatch('mousedown', { target: 'menu-item' });
    expect(closed).toEqual([]);
    h.release();
  });

  test('a press in the dialog body closes only the menu inside it', () => {
    const closed: string[] = [];
    const dialog = pushLayer({
      contains: node('dialog', ['dialog-body', 'menu', 'menu-item']).contains,
      onDismiss: () => closed.push('dialog')
    });
    const menu = pushLayer({
      contains: node('menu', ['menu-item']).contains,
      onDismiss: () => {
        closed.push('menu');
        menu.release();
      }
    });

    dispatch('mousedown', { target: 'dialog-body' });
    expect(closed).toEqual(['menu']);
    dialog.release();
  });

  test('a press on the page behind closes the whole stack, top down', () => {
    const closed: string[] = [];
    const dialog = pushLayer({
      contains: node('dialog', ['menu']).contains,
      onDismiss: () => {
        closed.push('dialog');
        dialog.release();
      }
    });
    const menu = pushLayer({
      contains: node('menu').contains,
      onDismiss: () => {
        closed.push('menu');
        menu.release();
      }
    });

    dispatch('mousedown', { target: 'page' });
    expect(closed).toEqual(['menu', 'dialog']);
    expect(layerDepth()).toBe(0);
  });
});

describe('lifecycle', () => {
  test('listeners are attached only while layers exist', () => {
    expect(listenerCount()).toBe(0);
    const a = pushLayer({ contains: () => false, onDismiss: () => {} });
    expect(listenerCount()).toBe(2);
    const b = pushLayer({ contains: () => false, onDismiss: () => {} });
    expect(listenerCount()).toBe(2); // still one pair, not one per layer
    a.release();
    expect(listenerCount()).toBe(2);
    b.release();
    expect(listenerCount()).toBe(0);
  });

  test('release is idempotent and order-independent', () => {
    const a = pushLayer({ contains: () => false, onDismiss: () => {} });
    const b = pushLayer({ contains: () => false, onDismiss: () => {} });
    a.release();
    a.release();
    expect(layerDepth()).toBe(1);
    b.release();
    expect(layerDepth()).toBe(0);
  });
});
