/**
 * User-facing messages for save-flow error codes. Used by both the topbar
 * SaveBar and the /save share-target landing page. Codes match those thrown
 * by `cleanUrl`, `assertPublicUrl`, and the rate-limit guard.
 */

const MESSAGES: Record<string, string> = {
  empty: 'Paste a link first.',
  parse_failed: "That link looks malformed.",
  bad_scheme: 'Only http(s) links can be saved.',
  private_address: 'That link points to a private network — only public URLs are saved.',
  dns_failed: "Couldn't resolve that domain.",
  rate_limited: 'Slow down a sec — too many saves in a short window.',
  no_url: "Couldn't find a link in what you shared.",
  unauthorized: 'Please sign in first.',
  missing_url: 'Paste a link first.',
  invalid_json: 'Something went wrong sending the request.',
  too_many_redirects: 'That link redirected too many times.'
};

export function saveErrorMessage(code: string | null | undefined, fallback = "Couldn't save that link."): string {
  if (!code) return fallback;
  return MESSAGES[code] ?? fallback;
}
