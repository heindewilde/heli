import { describe, expect, test } from 'vitest';
import { sanitize, sanitizePlainText } from './sanitize';

/**
 * Notes are sanitized on write, not on read — so anything that slips through
 * here is stored, and stays stored. These are the vectors worth pinning.
 */
describe('sanitize strips script execution vectors', () => {
  const vectors = [
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
    '<svg/onload=alert(1)>',
    '<iframe src="https://evil.example"></iframe>',
    '<object data="https://evil.example"></object>',
    '<embed src="https://evil.example">',
    '<style>body{background:url(javascript:alert(1))}</style>',
    '<math><mtext><script>alert(1)</script></mtext></math>',
    '<form action="https://evil.example"><input name="x"></form>'
  ];

  for (const v of vectors) {
    test(v.slice(0, 40), () => {
      const out = sanitize(v);
      expect(out).not.toMatch(/<script/i);
      expect(out).not.toMatch(/onerror/i);
      expect(out).not.toMatch(/onload/i);
      expect(out).not.toMatch(/<iframe/i);
      expect(out).not.toMatch(/<object/i);
      expect(out).not.toMatch(/<embed/i);
      expect(out).not.toMatch(/<style/i);
      expect(out).not.toMatch(/<form/i);
    });
  }
});

test('javascript: and data: hrefs are dropped', () => {
  expect(sanitize('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
  expect(sanitize('<a href="data:text/html,<script>alert(1)</script>">x</a>')).not.toMatch(
    /data:/i
  );
  // Case and whitespace tricks around the scheme.
  expect(sanitize('<a href="JaVaScRiPt:alert(1)">x</a>')).not.toMatch(/javascript:/i);
  expect(sanitize('<a href=" javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
});

test('permitted formatting survives', () => {
  expect(sanitize('<p>Hello <strong>world</strong></p>')).toBe(
    '<p>Hello <strong>world</strong></p>'
  );
  expect(sanitize('<ul><li>one</li><li>two</li></ul>')).toBe('<ul><li>one</li><li>two</li></ul>');
});

/**
 * Squire rewrites STRONG to B and EM to I as part of its own normalisation, so
 * `<b>`/`<i>` is what an editor save actually posts. They are not in
 * ALLOWED_TAGS and never will be — sanitize-html runs transformTags *before*
 * the allowlist check, so they arrive as strong/em and are kept under that
 * name. Without this, bold and italic are silently deleted on every save.
 */
test('editor bold and italic are normalised, not dropped', () => {
  expect(sanitize('<p><b>x</b> and <i>y</i></p>')).toBe('<p><strong>x</strong> and <em>y</em></p>');
});

/**
 * The reason `RichText.svelte` must construct Squire with `blockTag: 'P'`:
 * `div` is not on the allowlist, and sanitize-html discards a disallowed tag
 * while keeping its text. Left at Squire's default, every paragraph break in
 * the document would disappear on save with nothing to show for it.
 */
test('div paragraphs collapse — why blockTag must be P', () => {
  expect(sanitize('<div>one</div><div>two</div>')).toBe('onetwo');
});

test('editor-shaped output survives a round trip unchanged', () => {
  const html = '<p>intro</p><ul><li>one</li></ul><blockquote><p>quoted</p></blockquote>';
  expect(sanitize(html)).toBe(html);
});

/**
 * Collection and pipeline descriptions used to go through `sanitizePlainText`,
 * which strips control characters and nothing else, while NotesEditor renders
 * them with `{@html}`. Any member could store this and run it in every
 * colleague's session.
 */
test('a description-shaped payload is neutered', () => {
  expect(sanitize('<img src=x onerror="alert(1)">')).not.toMatch(/onerror|<img/i);
});

test('external links are forced to rel=nofollow noopener noreferrer and target=_blank', () => {
  const out = sanitize('<a href="https://example.com">x</a>');
  expect(out).toContain('rel="nofollow noopener noreferrer"');
  expect(out).toContain('target="_blank"');
});

describe('sanitizePlainText', () => {
  // Built with fromCharCode so the control bytes never sit literally in this
  // file, where an editor would silently eat them.
  const ch = (code: number) => String.fromCharCode(code);

  test('strips control characters', () => {
    expect(sanitizePlainText(`a${ch(0)}b${ch(7)}c`)).toBe('abc');
    expect(sanitizePlainText(`line${ch(27)}break`)).toBe('linebreak');
    expect(sanitizePlainText(`del${ch(127)}ete`)).toBe('delete');
  });

  test('keeps tab and newline', () => {
    expect(sanitizePlainText('a\tb\nc')).toBe('a\tb\nc');
  });

  test('trims and truncates to max', () => {
    expect(sanitizePlainText('   padded   ')).toBe('padded');
    expect(sanitizePlainText('x'.repeat(100), 10)).toHaveLength(10);
  });
});
