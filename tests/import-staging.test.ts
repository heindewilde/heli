import { beforeEach, describe, expect, test } from 'vitest';
import {
  ImportTooLargeError,
  MAX_IMPORT_ROWS,
  deletePendingImport,
  getPendingImport,
  pendingImportCount,
  storePendingImport,
  type MappedPerson
} from '../src/lib/server/contactImport';

/**
 * The staging map is in-process, so its eviction rules *are* its memory bound.
 *
 * It used to be keyed by a freshly minted token while the browser held only one
 * cookie, so every re-upload orphaned its predecessor: no code path could still
 * name the old id, so its TTL was never read and it survived until the process
 * died. A user retrying a flaky 3,400-row upload stranded ~1.4 MB a go. These
 * tests pin the three properties that fixed it — replace, sweep, cap — because
 * all three fail silently and none of them are visible from the UI.
 */

const person = (name: string): MappedPerson => ({
  name,
  email: null,
  phone: null,
  role: null,
  location: null,
  notes: null,
  suggestedCompanyName: null
});

const rows = (n: number) => Array.from({ length: n }, (_, i) => person(`p${i}`));

beforeEach(() => {
  // The map is module state shared across tests in this file.
  for (const u of ['alice', 'bob']) deletePendingImport(u);
});

describe('staging is one slot per user', () => {
  test('a second upload replaces the first rather than orphaning it', () => {
    const before = pendingImportCount();
    const first = storePendingImport('alice', rows(3), 0, 'linkedin_csv');
    const second = storePendingImport('alice', rows(5), 1, 'linkedin_csv');

    expect(pendingImportCount()).toBe(before + 1);
    // The old token is dead, so a stale cookie cannot commit the wrong batch.
    expect(getPendingImport(first, 'alice')).toBeNull();
    expect(getPendingImport(second, 'alice')?.toImport).toHaveLength(5);
  });

  test('two users stage independently', () => {
    const a = storePendingImport('alice', rows(2), 0, 'linkedin_csv');
    const b = storePendingImport('bob', rows(4), 0, 'google_contacts');

    expect(getPendingImport(a, 'alice')?.toImport).toHaveLength(2);
    expect(getPendingImport(b, 'bob')?.toImport).toHaveLength(4);
  });

  test("a token cannot be redeemed by anyone but its owner", () => {
    const a = storePendingImport('alice', rows(2), 0, 'linkedin_csv');
    storePendingImport('bob', rows(2), 0, 'linkedin_csv');

    expect(getPendingImport(a, 'bob')).toBeNull();
  });

  test('deleting is keyed by user, and releases the slot', () => {
    const a = storePendingImport('alice', rows(2), 0, 'linkedin_csv');
    deletePendingImport('alice');

    expect(getPendingImport(a, 'alice')).toBeNull();
  });
});

describe('the row cap', () => {
  test('rejects a file larger than one staging slot may hold', () => {
    expect(() => storePendingImport('alice', rows(MAX_IMPORT_ROWS + 1), 0, 'linkedin_csv')).toThrow(
      ImportTooLargeError
    );
    // Rejected *before* it is stored: a refused upload must not evict the batch
    // the user is already triaging.
    expect(pendingImportCount()).toBe(0);
  });

  test('accepts exactly the cap', () => {
    expect(() =>
      storePendingImport('alice', rows(MAX_IMPORT_ROWS), 0, 'linkedin_csv')
    ).not.toThrow();
  });
});
