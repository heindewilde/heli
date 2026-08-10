import { describe, expect, test } from 'vitest';
import { fuzzyFilter, fuzzyScore } from './fuzzy';

describe('fuzzyScore', () => {
  test('requires a subsequence', () => {
    expect(fuzzyScore('New person', 'np')).not.toBeNull();
    // 'pn' *is* a subsequence of "new person" (p at 4, n at 9) — order is all
    // that is required, not adjacency. 'pw' is not.
    expect(fuzzyScore('New person', 'pn')).not.toBeNull();
    expect(fuzzyScore('New person', 'pw')).toBeNull();
    expect(fuzzyScore('New person', 'newpersonx')).toBeNull();
  });

  test('an empty query matches everything, neutrally', () => {
    expect(fuzzyScore('anything', '')).toBe(0);
  });

  test('word-boundary initials beat mid-word letters', () => {
    // "np" as initials of "New person" must outrank the incidental n…p in
    // "Open pipeline" — this is the case that makes typing initials work.
    const initials = fuzzyScore('New person', 'np')!;
    const incidental = fuzzyScore('Open pipeline', 'np')!;
    expect(initials).toBeGreaterThan(incidental);
  });

  test('a prefix beats a match buried later', () => {
    expect(fuzzyScore('Settings', 'set')!).toBeGreaterThan(fuzzyScore('Reset password', 'set')!);
  });

  test('consecutive characters beat scattered ones', () => {
    expect(fuzzyScore('archive', 'arch')!).toBeGreaterThan(fuzzyScore('a random chive', 'arch')!);
  });

  test('the shorter of two equal matches wins', () => {
    expect(fuzzyScore('New project', 'new')!).toBeGreaterThan(
      fuzzyScore('New project from template', 'new')!
    );
  });

  test('matching is case-insensitive', () => {
    expect(fuzzyScore('New Person', 'NEW')).toBe(fuzzyScore('new person', 'new'));
  });
});

describe('fuzzyFilter', () => {
  const commands = [
    { id: 'a', title: 'Go to People', keywords: [] },
    { id: 'b', title: 'New person', keywords: ['contact'] },
    { id: 'c', title: 'Open settings', keywords: ['account', 'workspace'] },
    { id: 'd', title: 'Log an interaction', keywords: ['call', 'meeting'] }
  ];
  const keys = (c: (typeof commands)[number]) => [c.title, ...c.keywords];

  test('ranks best match first', () => {
    expect(fuzzyFilter(commands, 'np', keys)[0].item.id).toBe('b');
    expect(fuzzyFilter(commands, 'people', keys)[0].item.id).toBe('a');
  });

  test('matches on keywords, not just the title', () => {
    const hit = fuzzyFilter(commands, 'meeting', keys);
    expect(hit[0].item.id).toBe('d');
  });

  test('drops non-matches entirely', () => {
    expect(fuzzyFilter(commands, 'zzz', keys)).toEqual([]);
  });

  test('an empty query keeps everything in registration order', () => {
    expect(fuzzyFilter(commands, '', keys).map((s) => s.item.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
