import { describe, expect, test } from 'vitest';
import { parseCsv, findHeader } from '../src/lib/server/csvParse';
import { parseLinkedInConnections } from '../src/lib/server/linkedinCsv';

/**
 * The LinkedIn connections export.
 *
 * Worth testing carefully because it is the only *reliable* route to LinkedIn
 * data — there is no third-party profile API, and the profile DOM now carries no
 * metadata at all — and because the file has three properties that break naive
 * parsers: a preamble above the header, quoted fields containing commas, and a
 * mostly-empty email column that is normal rather than broken.
 */

/** The real file's shape: notes paragraph, blank line, then the header. */
const PREAMBLE = [
  '"Notes:"',
  '"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address."',
  '',
  ''
].join('\r\n');

const HEADER = 'First Name,Last Name,URL,Email Address,Company,Position,Connected On';

const file = (...rows: string[]) => [PREAMBLE, HEADER, ...rows].join('\r\n') + '\r\n';

describe('the CSV reader', () => {
  test('quoted fields may contain commas, quotes and newlines', () => {
    const rows = parseCsv('a,"b,c","say ""hi""","two\nlines"\r\nx,y,z,w');
    expect(rows[0]).toEqual(['a', 'b,c', 'say "hi"', 'two\nlines']);
    expect(rows[1]).toEqual(['x', 'y', 'z', 'w']);
  });

  test('CRLF, LF and a missing final newline all parse the same', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual(parseCsv('a,b\nc,d'));
  });

  test('a trailing newline does not invent an empty row', () => {
    expect(parseCsv('a,b\r\n')).toEqual([['a', 'b']]);
  });

  test('the UTF-8 BOM does not end up glued to the first header', () => {
    // csv.ts writes this BOM for Excel, and Excel writes it back. Without the
    // strip, '﻿First Name' never matches 'first name'.
    const rows = parseCsv('﻿First Name,Last Name\r\nAda,Lovelace');
    expect(findHeader(rows, ['First Name'])).not.toBeNull();
  });

  test('the header is found by content, not by a fixed offset', () => {
    const rows = parseCsv(file('Ada,Lovelace,,,,,'));
    const found = findHeader(rows, ['First Name', 'Last Name'])!;
    expect(found.dataStart).toBe(5);
    expect(found.columns.get('email address')).toBe(3);
  });
});

describe('parseLinkedInConnections', () => {
  test('maps the documented seven columns onto a person', () => {
    const { people } = parseLinkedInConnections(
      file('Ada,Lovelace,https://www.linkedin.com/in/ada,ada@example.com,Analytical Engines,Engineer,04 Mar 2019')
    );
    expect(people).toHaveLength(1);
    expect(people[0]).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      role: 'Engineer',
      location: null,
      notes: 'Connected on LinkedIn: 04 Mar 2019',
      // A name, not an id — the same suggestion the extension produces.
      suggestedCompanyName: 'Analytical Engines',
      url: 'https://www.linkedin.com/in/ada'
    });
  });

  test('reads by column name, so a reordered export still works', () => {
    const text = [
      PREAMBLE,
      'Position,Company,Last Name,First Name,URL,Connected On,Email Address',
      'Engineer,Analytical Engines,Lovelace,Ada,https://www.linkedin.com/in/ada,04 Mar 2019,ada@example.com'
    ].join('\r\n');
    const { people } = parseLinkedInConnections(text);
    expect(people[0].name).toBe('Ada Lovelace');
    expect(people[0].role).toBe('Engineer');
    expect(people[0].email).toBe('ada@example.com');
  });

  test('a blank email is the normal case, not a failure', () => {
    // Most rows look like this: the privacy setting is off by default.
    const { people, skipped } = parseLinkedInConnections(
      file('Grace,Hopper,https://www.linkedin.com/in/grace,,US Navy,Rear Admiral,01 Jan 2020')
    );
    expect(skipped).toBe(0);
    expect(people[0].email).toBeNull();
    expect(people[0].name).toBe('Grace Hopper');
  });

  test('a company containing a comma survives', () => {
    const { people } = parseLinkedInConnections(
      file('Ada,Lovelace,,,"Babbage, Lovelace & Co",Engineer,04 Mar 2019')
    );
    expect(people[0].suggestedCompanyName).toBe('Babbage, Lovelace & Co');
  });

  test('the URL is normalised with the app’s own rules', () => {
    // So a later capture of the same profile from the extension deduplicates
    // against this row instead of creating a second person.
    const { people } = parseLinkedInConnections(
      file('Ada,Lovelace,https://www.linkedin.com/in/ada/en?trk=nav,,,,')
    );
    expect(people[0].url).toBe('https://www.linkedin.com/in/ada');
  });

  test('an unparseable URL leaves the person without one rather than dropping them', () => {
    const { people } = parseLinkedInConnections(file('Ada,Lovelace,not a url,,,,'));
    expect(people).toHaveLength(1);
    expect(people[0].url).toBeNull();
  });

  test('a row with no name is counted, not silently dropped', () => {
    const { people, skipped } = parseLinkedInConnections(
      file('Ada,Lovelace,,,,,', ',,https://www.linkedin.com/in/ghost,,,,')
    );
    expect(people).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  test('blank trailing lines are not counted as skipped contacts', () => {
    const { people, skipped } = parseLinkedInConnections(file('Ada,Lovelace,,,,,', '', ''));
    expect(people).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  test('a file that is not a connections export yields nothing rather than garbage', () => {
    const { people } = parseLinkedInConnections('Name,Email\r\nAda,ada@example.com');
    expect(people).toEqual([]);
  });

  test('only a last name is still a usable person', () => {
    const { people } = parseLinkedInConnections(file(',Lovelace,,,,,'));
    expect(people[0].name).toBe('Lovelace');
  });
});
