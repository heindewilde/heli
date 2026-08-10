import { describe, expect, test } from 'vitest';
import { parseIcs } from './ics';

/** Build a calendar from lines, with CRLF as real feeds use. */
const cal = (...lines: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');

const event = (...lines: string[]) => cal('BEGIN:VEVENT', ...lines, 'END:VEVENT');

describe('line folding', () => {
  test('unfolds continuation lines before parsing anything', () => {
    // Google folds at 75 octets, mid-token. A parser that reads folded lines
    // produces a truncated UID — a broken identity key rather than an error.
    const { events } = parseIcs(
      event('UID:abc-very-long-identifier', ' -continued-here', 'SUMMARY:Kickoff')
    );
    expect(events[0].uid).toBe('abc-very-long-identifier-continued-here');
  });

  test('unfolds tab continuations too', () => {
    const { events } = parseIcs(event('UID:x', 'SUMMARY:Long', '\tsummary'));
    expect(events[0].summary).toBe('Longsummary');
  });
});

describe('text escaping', () => {
  test('unescapes newlines, commas, semicolons and backslashes', () => {
    const { events } = parseIcs(
      event('UID:x', 'SUMMARY:Lunch\\, then\\; talk', 'DESCRIPTION:Line1\\nLine2\\\\done')
    );
    expect(events[0].summary).toBe('Lunch, then; talk');
    expect(events[0].description).toBe('Line1\nLine2\\done');
  });
});

describe('dates', () => {
  test('UTC timestamps', () => {
    const { events } = parseIcs(event('UID:x', 'DTSTART:20260315T140000Z'));
    expect(events[0].start).toBe(Date.UTC(2026, 2, 15, 14, 0, 0));
    expect(events[0].allDay).toBe(false);
  });

  test('VALUE=DATE is an all-day event', () => {
    const { events } = parseIcs(event('UID:x', 'DTSTART;VALUE=DATE:20260315'));
    expect(events[0].allDay).toBe(true);
    expect(events[0].start).toBe(Date.UTC(2026, 2, 15));
  });

  test('TZID resolves through Intl, with no tz database shipped', () => {
    // 2026-03-15 14:00 in Amsterdam is CET (UTC+1) — 13:00 UTC.
    const { events } = parseIcs(
      event('UID:x', 'DTSTART;TZID=Europe/Amsterdam:20260315T140000')
    );
    expect(events[0].start).toBe(Date.UTC(2026, 2, 15, 13, 0, 0));
  });

  test('TZID handles a summer date at the other offset', () => {
    // 2026-07-15 14:00 Amsterdam is CEST (UTC+2) — 12:00 UTC. Same zone,
    // different offset, which is why the offset has to be computed per instant
    // rather than looked up once.
    const { events } = parseIcs(
      event('UID:x', 'DTSTART;TZID=Europe/Amsterdam:20260715T140000')
    );
    expect(events[0].start).toBe(Date.UTC(2026, 6, 15, 12, 0, 0));
  });

  test('an unknown TZID falls back to UTC and is reported', () => {
    const res = parseIcs(event('UID:x', 'DTSTART;TZID=Mars/Olympus:20260315T140000'));
    expect(res.events[0].start).toBe(Date.UTC(2026, 2, 15, 14, 0, 0));
    expect(res.unknownTimezones).toContain('Mars/Olympus');
  });

  test('floating local time is read as UTC rather than dropped', () => {
    const { events } = parseIcs(event('UID:x', 'DTSTART:20260315T140000'));
    expect(events[0].start).toBe(Date.UTC(2026, 2, 15, 14, 0, 0));
  });
});

describe('attendees', () => {
  test('extracts mailto addresses, names and partstat', () => {
    const { events } = parseIcs(
      event(
        'UID:x',
        'ORGANIZER;CN=Ada Lovelace:mailto:Ada@Example.com',
        'ATTENDEE;CN=Grace Hopper;PARTSTAT=ACCEPTED:mailto:grace@example.com'
      )
    );
    expect(events[0].organizer).toEqual({
      email: 'ada@example.com', // lowercased, so matching is case-insensitive
      name: 'Ada Lovelace',
      partstat: null
    });
    expect(events[0].attendees[0]).toEqual({
      email: 'grace@example.com',
      name: 'Grace Hopper',
      partstat: 'ACCEPTED'
    });
  });

  test('skips rooms and resources', () => {
    const { events } = parseIcs(
      event(
        'UID:x',
        'ATTENDEE;CUTYPE=ROOM:mailto:boardroom@example.com',
        'ATTENDEE;CUTYPE=RESOURCE:mailto:projector@example.com',
        'ATTENDEE:mailto:real@example.com'
      )
    );
    expect(events[0].attendees.map((a) => a.email)).toEqual(['real@example.com']);
  });

  test('ignores attendees with no usable address', () => {
    const { events } = parseIcs(event('UID:x', 'ATTENDEE:invalid', 'ATTENDEE:mailto:'));
    expect(events[0].attendees).toEqual([]);
  });

  test('a quoted parameter containing a colon does not split the property early', () => {
    const { events } = parseIcs(
      event('UID:x', 'ATTENDEE;CN="Lovelace, Ada: Eng":mailto:ada@example.com')
    );
    expect(events[0].attendees[0].email).toBe('ada@example.com');
    expect(events[0].attendees[0].name).toBe('Lovelace, Ada: Eng');
  });
});

describe('cancellation', () => {
  test('STATUS:CANCELLED marks the event', () => {
    const { events } = parseIcs(event('UID:x', 'STATUS:CANCELLED'));
    expect(events[0].cancelled).toBe(true);
  });

  test('METHOD:CANCEL marks every event in the calendar', () => {
    const text = cal('METHOD:CANCEL', 'BEGIN:VEVENT', 'UID:x', 'END:VEVENT');
    expect(parseIcs(text).events[0].cancelled).toBe(true);
  });
});

describe('recurrence', () => {
  test('recurring events are skipped and counted, not silently dropped', () => {
    const text = cal(
      'BEGIN:VEVENT',
      'UID:weekly',
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:once',
      'END:VEVENT'
    );
    const res = parseIcs(text);
    expect(res.recurringSkipped).toBe(1);
    expect(res.events.map((e) => e.uid)).toEqual(['once']);
  });

  test('RECURRENCE-ID is kept — it is part of an instance’s identity', () => {
    const { events } = parseIcs(event('UID:series', 'RECURRENCE-ID:20260315T140000Z'));
    expect(events[0].recurrenceId).toBe('20260315T140000Z');
  });
});

describe('robustness', () => {
  test('an event with no UID is ignored rather than crashing', () => {
    expect(parseIcs(event('SUMMARY:Nameless')).events).toEqual([]);
  });

  test('junk input yields no events instead of throwing', () => {
    expect(parseIcs('this is not a calendar').events).toEqual([]);
    expect(parseIcs('').events).toEqual([]);
  });

  test('parses several events in one calendar', () => {
    const text = cal(
      'BEGIN:VEVENT',
      'UID:a',
      'SUMMARY:One',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:b',
      'SUMMARY:Two',
      'END:VEVENT'
    );
    expect(parseIcs(text).events.map((e) => e.summary)).toEqual(['One', 'Two']);
  });
});
