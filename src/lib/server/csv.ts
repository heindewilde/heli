/**
 * Tiny CSV writer. Streams rows as Uint8Array chunks. RFC 4180 quoting:
 * - Always quote fields that contain a comma, quote, CR, or LF.
 * - Double internal quotes.
 * - Use CRLF as the row separator.
 */

const ENC = new TextEncoder();
const CRLF = '\r\n';

function escapeField(value: unknown): string {
  if (value == null) return '';
  let s = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function csvLine(fields: readonly unknown[]): string {
  return fields.map(escapeField).join(',') + CRLF;
}

export type CsvSource<T> = {
  header: readonly string[];
  rows: AsyncIterable<T> | Iterable<T>;
  toRow: (item: T) => readonly unknown[];
};

export function csvStream<T>(src: CsvSource<T>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(ENC.encode(csvLine(src.header)));
        for await (const item of src.rows as AsyncIterable<T>) {
          controller.enqueue(ENC.encode(csvLine(src.toRow(item))));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    }
  });
}

export function isoDate(ts: number | null | undefined): string {
  if (!ts) return '';
  return new Date(ts).toISOString();
}
