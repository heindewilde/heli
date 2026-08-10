import { beforeEach, expect, test, vi } from 'vitest';

const body = { style: { overflow: '' } };
vi.stubGlobal('document', { body });

const { lockScroll } = await import('./scrollLock');

beforeEach(() => {
  body.style.overflow = '';
});

test('nested locks release in any order without unlocking early', () => {
  // The exact sequence that used to break: open the mobile drawer, open a
  // dialog on top of it, close the dialog. The page must stay locked.
  const drawer = lockScroll();
  expect(body.style.overflow).toBe('hidden');

  const dialog = lockScroll();
  dialog();
  expect(body.style.overflow).toBe('hidden');

  drawer();
  expect(body.style.overflow).toBe('');
});

test('the original overflow value is restored, not blanked', () => {
  body.style.overflow = 'scroll';
  const release = lockScroll();
  expect(body.style.overflow).toBe('hidden');
  release();
  expect(body.style.overflow).toBe('scroll');
});

test('releasing twice does not corrupt the count', () => {
  const a = lockScroll();
  const b = lockScroll();
  a();
  a();
  expect(body.style.overflow).toBe('hidden');
  b();
  expect(body.style.overflow).toBe('');
});
