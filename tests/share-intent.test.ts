import { describe, expect, test } from 'vitest';
import { extractUrl, resolveShare } from '../mobile/src/native/shareIntent';

/**
 * What a share actually contains.
 *
 * The share extension itself needs a signed build on a device. The parsing does
 * not, and the parsing is where this goes wrong: the share sheet hands over a
 * page in several different shapes, and picking the wrong one means either a
 * failed capture or — worse — a duplicate of someone already saved, because the
 * URL that reaches `/lookup` did not match the one stored.
 */

describe('extractUrl', () => {
  test('finds a URL inside shared text', () => {
    // The common shape: apps that send "title + link" as one string rather than
    // filling the URL field.
    expect(extractUrl('Ada Lovelace https://example.com/ada')).toBe('https://example.com/ada');
  });

  test('trims the punctuation a sentence leaves behind', () => {
    // "…see https://example.com/x." is a link and a full stop far more often
    // than a link ending in one.
    expect(extractUrl('Look at https://example.com/x.')).toBe('https://example.com/x');
    expect(extractUrl('(https://example.com/y)')).toBe('https://example.com/y');
    expect(extractUrl('https://example.com/z!')).toBe('https://example.com/z');
  });

  test('keeps meaningful trailing characters', () => {
    // A slash or a query is part of the URL; stripping it would change the page.
    expect(extractUrl('https://example.com/path/')).toBe('https://example.com/path/');
    expect(extractUrl('https://example.com/?q=1')).toBe('https://example.com/?q=1');
  });

  test('returns null when there is no link', () => {
    expect(extractUrl('just some notes about a meeting')).toBeNull();
    expect(extractUrl('')).toBeNull();
  });
});

describe('resolveShare', () => {
  test('prefers the structured field over the text beside it', () => {
    // Safari sends both; the text is usually the page title.
    const result = resolveShare({
      webUrl: 'https://example.com/real',
      text: 'Page Title https://example.com/wrong'
    });
    expect(result).toEqual({ kind: 'url', url: 'https://example.com/real' });
  });

  test('falls back to the text when there is no URL field', () => {
    const result = resolveShare({ text: 'Ada — https://example.com/ada' });
    expect(result.kind).toBe('url');
  });

  test('canonicalises through the same cleanUrl the extension uses', () => {
    // The whole point. A share and a browser capture of the same page have to
    // produce one record, and `/lookup` matches on the stored URL — so tracking
    // parameters surviving here would mean a duplicate person.
    const shared = resolveShare({
      webUrl: 'https://www.linkedin.com/in/ada-lovelace/?utm_source=share&trk=x'
    });
    expect(shared.kind).toBe('url');
    if (shared.kind !== 'url') return;
    expect(shared.url).not.toContain('utm_source');
    expect(shared.url).not.toContain('trk=');
  });

  test('the same page shared twice, with different noise, is one record', () => {
    const a = resolveShare({ webUrl: 'https://www.linkedin.com/in/ada/' });
    const b = resolveShare({
      text: 'shared https://www.linkedin.com/in/ada/details/experience?utm_medium=ios_app'
    });
    expect(a.kind).toBe('url');
    expect(b.kind).toBe('url');
    if (a.kind !== 'url' || b.kind !== 'url') return;
    // Trailing slash, a sub-view path and tracking parameters all normalise
    // away, so `/lookup` finds the person who is already saved.
    expect(a.url).toBe(b.url);
  });

  /**
   * A known edge, pinned so it is a decision rather than a surprise.
   *
   * `cleanUrl` lowercases the host and strips `www.` to work out *which site*
   * it is looking at, but does not rewrite the hostname — so `www.linkedin.com`
   * and `linkedin.com` are two records. In practice LinkedIn redirects to
   * `www`, so a capture and a share of a real page agree; a share from an app
   * that sends the bare host would not.
   *
   * Not changed here, and deliberately: `(workspace_id, url)` is the dedup key
   * for every person and company already stored, all captured with whatever
   * host the page used. Normalising now would re-key them, so the first capture
   * after the change would duplicate everyone. That is a migration, with a
   * backfill, not a tidy-up.
   */
  test('www and bare host are still distinct — see the note above', () => {
    const withWww = resolveShare({ webUrl: 'https://www.linkedin.com/in/ada' });
    const without = resolveShare({ webUrl: 'https://linkedin.com/in/ada' });
    if (withWww.kind !== 'url' || without.kind !== 'url') throw new Error('expected urls');
    expect(withWww.url).not.toBe(without.url);
  });

  test('text with no link is handed back rather than dropped', () => {
    // The capture screen shows it in an editable field. A human sees what is
    // wrong faster than a parser does, and silently discarding a share is the
    // worst outcome.
    expect(resolveShare({ text: 'met someone at the summit' })).toEqual({
      kind: 'unusable',
      text: 'met someone at the summit'
    });
  });

  test('an empty share is nothing, not an error', () => {
    expect(resolveShare({})).toEqual({ kind: 'none' });
    expect(resolveShare({ text: '   ' })).toEqual({ kind: 'none' });
  });

  test('a malformed URL is surfaced, not thrown', () => {
    const result = resolveShare({ webUrl: 'http://' });
    expect(result.kind).toBe('unusable');
  });
});
