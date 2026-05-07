import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { cleanUrl, assertPublicUrl, UrlError } from '$lib/server/url';
import { classify } from '$lib/server/classify';
import { savePerson } from '$lib/server/savePerson';
import { saveCompany } from '$lib/server/saveCompany';
import { checkRateLimit, LIMITS, RateLimitError } from '$lib/server/rate-limit';

const URL_RE = /https?:\/\/[^\s<>"'`]+/i;

function pickUrl(...sources: (string | null)[]): string | null {
  for (const s of sources) {
    if (!s) continue;
    const trimmed = s.trim();
    if (!trimmed) continue;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const m = trimmed.match(URL_RE);
    if (m) return m[0];
  }
  return null;
}

export const load: PageServerLoad = async ({ url, locals }) => {
  if (!locals.user) {
    // Stash the original query so the user can sign in and come back.
    const back = `/save?${url.searchParams.toString()}`;
    throw redirect(303, `/auth?next=${encodeURIComponent(back)}`);
  }

  const raw = pickUrl(
    url.searchParams.get('url'),
    url.searchParams.get('text'),
    url.searchParams.get('title')
  );
  if (!raw) return { error: 'no_url' as const };

  try {
    checkRateLimit(LIMITS.save, locals.user.id);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: 'rate_limited' as const };
    throw err;
  }

  let cleaned: string;
  try {
    cleaned = cleanUrl(raw);
  } catch (err) {
    if (err instanceof UrlError) return { error: err.code as 'bad_scheme' | 'parse_failed' | 'empty' };
    throw err;
  }
  const u = new URL(cleaned);
  try {
    await assertPublicUrl(u);
  } catch (err) {
    if (err instanceof UrlError) return { error: err.code as 'private_address' | 'dns_failed' | 'bad_scheme' };
    throw err;
  }

  const kind = classify(u);
  const result =
    kind === 'person'
      ? await savePerson(locals.user.id, locals.user.region, cleaned)
      : await saveCompany(locals.user.id, locals.user.region, cleaned);

  // Land on the detail page so the user can confirm + edit. The toast on
  // detail pages already conveys parsing state for fresh stubs; for dedup we
  // rely on the visible record being unchanged.
  const path = kind === 'person' ? `/people/${result.id}` : `/companies/${result.id}`;
  throw redirect(303, path + (result.dedup ? '?dedup=1' : ''));
};
