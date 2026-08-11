import { expect, test, describe } from 'vitest';
import { hasBlockMarkup, plainToHtml, toEditorHtml, htmlToPlain } from './richText';

describe('hasBlockMarkup', () => {
  test('a legacy note is plain text', () => {
    expect(hasBlockMarkup('Met at the conference.\n\nFollow up.')).toBe(false);
  });

  test('editor output is not', () => {
    expect(hasBlockMarkup('<p>Met at the conference.</p>')).toBe(true);
  });

  test('inline formatting alone does not count', () => {
    // A plain-text note with one bold word still keeps its paragraphs in \n,
    // so it must still be converted.
    expect(hasBlockMarkup('a <strong>bold</strong> word\nand a new line')).toBe(false);
  });

  test('null and empty are plain', () => {
    expect(hasBlockMarkup(null)).toBe(false);
    expect(hasBlockMarkup('')).toBe(false);
  });
});

describe('plainToHtml', () => {
  test('a blank line starts a new paragraph', () => {
    expect(plainToHtml('one\n\ntwo')).toBe('<p>one</p><p>two</p>');
  });

  test('a single newline is a line break inside the paragraph', () => {
    expect(plainToHtml('one\ntwo')).toBe('<p>one<br>two</p>');
  });

  test('runs of blank lines collapse to one break', () => {
    expect(plainToHtml('one\n\n\n\ntwo')).toBe('<p>one</p><p>two</p>');
  });

  test('already-sanitized inline markup is preserved, not escaped', () => {
    // The input is storage that `sanitize()` already vetted. Escaping here
    // would turn a stored <strong> into visible angle brackets.
    expect(plainToHtml('a <strong>bold</strong> word')).toBe('<p>a <strong>bold</strong> word</p>');
  });
});

describe('toEditorHtml', () => {
  test('leaves real markup alone', () => {
    expect(toEditorHtml('<p>already</p>')).toBe('<p>already</p>');
  });

  test('converts a legacy value', () => {
    expect(toEditorHtml('one\n\ntwo')).toBe('<p>one</p><p>two</p>');
  });

  test('empty stays empty', () => {
    expect(toEditorHtml(null)).toBe('');
  });
});

describe('htmlToPlain', () => {
  /**
   * This is the character counter as well as the `text/plain` clipboard
   * flavour. `textContent` would return "onetwo" here — a count LinkedIn
   * disagrees with, and a paste that runs two paragraphs together.
   */
  test('paragraph boundaries become newlines', () => {
    expect(htmlToPlain('<p>one</p><p>two</p>')).toBe('one\ntwo');
  });

  test('br becomes a newline', () => {
    expect(htmlToPlain('<p>one<br>two</p>')).toBe('one\ntwo');
  });

  test('tags are dropped but their text kept', () => {
    expect(htmlToPlain('<p>a <strong>bold</strong> word</p>')).toBe('a bold word');
  });

  test('entities are decoded, ampersand last', () => {
    expect(htmlToPlain('<p>&amp;lt; stays literal</p>')).toBe('&lt; stays literal');
    expect(htmlToPlain('<p>Tom &amp; Jerry &lt;3</p>')).toBe('Tom & Jerry <3');
  });

  test('list items do not run together', () => {
    expect(htmlToPlain('<ul><li>one</li><li>two</li></ul>')).toBe('one\ntwo');
  });
});
