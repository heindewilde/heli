import { parseCsv, findHeader } from './csvParse';
import { cleanUrl } from './url';
import type { MappedPerson } from './contactImport';

/**
 * LinkedIn's own "Export connections" CSV.
 *
 * This exists because there is no other reliable way in. LinkedIn has no API
 * for third-party profiles — the Sales Navigator platform stopped accepting new
 * partners, and every other product returns only the authenticated member's own
 * profile. Scraping the page is what the extension does, and today's profile DOM
 * carries no `og:` tags, no JSON-LD and no stable class names, so it can recover
 * a name and little else. The member's own export is the one source that is
 * official, complete for first-degree connections, and cannot rot: LinkedIn
 * supports it as a feature.
 *
 * Documented shape (7 columns): First Name, Last Name, URL, Email Address,
 * Company, Position, Connected On. Three things about it in practice:
 *
 * - **There is a preamble.** The file opens with a "Notes:" paragraph about
 *   missing email addresses and a blank line, so the header is not row 1. The
 *   number of lines has changed before, which is why `findHeader` searches for
 *   the header rather than skipping a fixed count.
 * - **Columns are read by name, not position.** Same reason.
 * - **Most emails are blank.** Only connections who enabled "allow connections
 *   to see my email address" appear, and it is off by default. A blank email is
 *   the normal case, not a parse failure.
 */

export type LinkedInImport = {
  people: MappedPerson[];
  /** Rows that had no usable name — counted so the UI can be honest about it. */
  skipped: number;
};

const REQUIRED = ['First Name', 'Last Name'];

/** LinkedIn writes "04 Mar 2019"; keep it readable and don't pretend to parse it. */
function connectedNote(date: string): string | null {
  const trimmed = date.trim();
  return trimmed ? `Connected on LinkedIn: ${trimmed}` : null;
}

export function parseLinkedInConnections(text: string): LinkedInImport {
  const rows = parseCsv(text);
  const header = findHeader(rows, REQUIRED);
  if (!header) return { people: [], skipped: 0 };

  const { columns, dataStart } = header;
  const at = (row: string[], name: string): string => {
    const index = columns.get(name);
    return index === undefined ? '' : (row[index] ?? '').trim();
  };

  const people: MappedPerson[] = [];
  let skipped = 0;

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    // A blank trailing line is not a skipped contact.
    if (row.every((cell) => cell.trim() === '')) continue;

    const name = [at(row, 'first name'), at(row, 'last name')].filter(Boolean).join(' ').trim();
    if (!name) {
      skipped++;
      continue;
    }

    // Normalised with the app's own rules so a later capture of the same
    // profile from the extension deduplicates against this row rather than
    // creating a second person.
    let url: string | null = null;
    const rawUrl = at(row, 'url');
    if (rawUrl) {
      try {
        url = cleanUrl(rawUrl);
      } catch {
        url = null;
      }
    }

    people.push({
      name,
      email: at(row, 'email address') || null,
      phone: null,
      role: at(row, 'position') || null,
      location: null,
      notes: connectedNote(at(row, 'connected on')),
      // A company *name*, with no company row behind it — the same suggestion
      // the extension and the Google import produce, which `/people/[id]`
      // offers to link.
      suggestedCompanyName: at(row, 'company') || null,
      url
    });
  }

  return { people, skipped };
}
