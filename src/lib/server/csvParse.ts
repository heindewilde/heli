/**
 * Tiny CSV reader — the counterpart to the writer in `csv.ts`, and deliberately
 * not a dependency. RFC 4180:
 * - A field wrapped in double quotes may contain commas, CRLF and quotes.
 * - An escaped quote inside a quoted field is doubled (`""`).
 * - Rows end with CRLF, LF or CR.
 *
 * Handles the UTF-8 BOM that `csv.ts` writes for Excel's benefit, and that
 * Excel itself writes back out — a leading `﻿` otherwise ends up glued to
 * the first header name, so `"First Name"` silently fails to match.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"' && field === '') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === ',') {
      endField();
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endRow();
      // Treat CRLF as one terminator, not an empty row.
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }

  // A file not ending in a newline still has a final row; one that does must not
  // gain a trailing empty one.
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/**
 * Find the header row and index it by name.
 *
 * Returns a lookup from normalised header name to column index, plus the row
 * the data starts on. `required` names all have to be present for a row to
 * qualify as the header — that is what lets a file with preamble lines above
 * the real header be read without hardcoding how many lines to skip.
 */
export function findHeader(
  rows: string[][],
  required: string[]
): { columns: Map<string, number>; dataStart: number } | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const want = required.map(norm);

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].map(norm);
    if (!want.every((w) => cells.includes(w))) continue;
    const columns = new Map<string, number>();
    cells.forEach((cell, index) => {
      if (cell && !columns.has(cell)) columns.set(cell, index);
    });
    return { columns, dataStart: r + 1 };
  }
  return null;
}
