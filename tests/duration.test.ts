/**
 * Pure — no DB, no dynamic imports needed.
 *
 * `parseDuration` is the one that earns its tests: it accepts five shapes
 * because people type all five, and the failure mode of getting one wrong is
 * silently recording the wrong number of billable minutes.
 */
import { describe, expect, test } from 'vitest';
import {
  formatMinutes,
  formatHours,
  minutesToHours,
  hoursToMinutes,
  parseDuration
} from '../src/lib/duration';

describe('formatMinutes', () => {
  test('renders hours and minutes', () => {
    expect(formatMinutes(390)).toBe('6h 30m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(360)).toBe('6h');
    expect(formatMinutes(0)).toBe('0m');
  });

  test('never renders a negative', () => {
    expect(formatMinutes(-30)).toBe('0m');
  });
});

describe('formatHours', () => {
  test('drops a trailing .0', () => {
    expect(formatHours(960)).toBe('16h');
    expect(formatHours(450)).toBe('7.5h');
    expect(formatHours(2400)).toBe('40h');
  });
});

describe('hoursToMinutes', () => {
  test('accepts decimal points and commas', () => {
    expect(hoursToMinutes('7.5')).toBe(450);
    expect(hoursToMinutes('7,5')).toBe(450);
    expect(hoursToMinutes('16')).toBe(960);
  });

  test('empty is null, not zero — the caller must tell them apart', () => {
    expect(hoursToMinutes('')).toBeNull();
    expect(hoursToMinutes('   ')).toBeNull();
  });

  test('rejects negatives and nonsense', () => {
    expect(hoursToMinutes('-4')).toBeNull();
    expect(hoursToMinutes('lunch')).toBeNull();
  });

  test('round-trips through minutesToHours', () => {
    expect(minutesToHours(hoursToMinutes('7.5')!)).toBe(7.5);
    expect(minutesToHours(960)).toBe(16);
  });
});

describe('parseDuration', () => {
  test('every shape people type lands on the same 90 minutes', () => {
    for (const input of ['1:30', '1.5h', '90m', '90', '1h30', '1h 30m']) {
      expect(parseDuration(input), input).toBe(90);
    }
  });

  test('other real inputs', () => {
    expect(parseDuration('2h')).toBe(120);
    expect(parseDuration('0:45')).toBe(45);
    expect(parseDuration('2h15')).toBe(135);
    expect(parseDuration('45')).toBe(45);
  });

  test('garbage is null so the caller can leave the value alone', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('soon')).toBeNull();
    expect(parseDuration('1:75')).toBeNull();
    expect(parseDuration('1h75m')).toBeNull();
  });

  test('is case- and whitespace-insensitive', () => {
    expect(parseDuration(' 2H ')).toBe(120);
    expect(parseDuration('90M')).toBe(90);
  });
});
