/**
 * Read the machine-readable error code out of a failed API response.
 *
 * SvelteKit's `error(400, 'some_code')` inside a `+server.ts` serialises to the
 * JSON body `{"message":"some_code"}` — not to the bare string. Reading
 * `res.text()` and looking that up in a code map therefore never matches, and
 * displaying it puts raw JSON in front of the user. Both mistakes shipped here
 * more than once, in separate files, because the broken idiom reads fine.
 *
 * Always go through this instead of touching the body directly.
 */
export async function readErrorCode(res: Response): Promise<string> {
  try {
    const body = await res.clone().json();
    if (body && typeof body.message === 'string') return body.message;
  } catch {
    // Not JSON (a proxy error page, an empty body) — fall back to the text.
  }
  try {
    return (await res.text()).trim();
  } catch {
    return '';
  }
}
