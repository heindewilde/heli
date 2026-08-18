import { expect, test } from 'vitest';
import { extractUrls } from '../src/lib/server/urlList';

/**
 * The brief was "we should be the ones recognising the URLs", so the interesting
 * cases here are all the shapes somebody might paste — and the two shapes that
 * must *not* be read as links.
 */

test('finds links in free text', () => {
  expect(
    extractUrls('Met https://acme.com at the conference, also see https://beta.io/about today.')
  ).toEqual(['https://acme.com', 'https://beta.io/about']);
});

test('strips sentence punctuation from the end', () => {
  expect(extractUrls('Look at https://acme.com.')).toEqual(['https://acme.com']);
  expect(extractUrls('(see https://acme.com/x)')).toEqual(['https://acme.com/x']);
});

test('splits a comma-separated list rather than reading it as one URL', () => {
  expect(extractUrls('https://a.com,https://b.com,https://c.com')).toEqual([
    'https://a.com',
    'https://b.com',
    'https://c.com'
  ]);
});

test('reads a CSV column without a CSV parser', () => {
  const csv = 'Name,Profile,Notes\nAda,https://linkedin.com/in/ada,met at work\nGrace,https://linkedin.com/in/grace,';
  expect(extractUrls(csv)).toEqual([
    'https://linkedin.com/in/ada',
    'https://linkedin.com/in/grace'
  ]);
});

test('promotes a bare host that occupies a whole field', () => {
  expect(extractUrls('acme.com\nbeta.co.uk\n')).toEqual(['https://acme.com', 'https://beta.co.uk']);
  expect(extractUrls('Name,Domain\nAcme,acme.com')).toContain('https://acme.com');
});

/**
 * The anchor on the bare-host pattern is what stops this. Without it, "i.e."
 * and "etc." inside prose become records.
 */
test('does not read a bare host out of the middle of a sentence', () => {
  expect(extractUrls('we discussed pricing i.e. the usual terms')).toEqual([]);
  expect(extractUrls('Call me tomorrow.')).toEqual([]);
});

test('dedupes case-insensitively, keeping first appearance order', () => {
  expect(extractUrls('https://Acme.com and https://acme.com and https://beta.io')).toEqual([
    'https://Acme.com',
    'https://beta.io'
  ]);
});

test('pulls the href out of a markdown link', () => {
  expect(extractUrls('[Ada](https://linkedin.com/in/ada) is great')).toEqual([
    'https://linkedin.com/in/ada'
  ]);
});

test('ignores a non-http scheme', () => {
  expect(extractUrls('mailto:ada@acme.com and ftp://files.acme.com')).toEqual([]);
});

test('respects the cap', () => {
  const many = Array.from({ length: 50 }, (_, i) => `https://site${i}.com`).join('\n');
  expect(extractUrls(many, 10)).toHaveLength(10);
});
