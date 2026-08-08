import { requireScope } from '$lib/server/scope';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { cleanUrl, assertPublicUrl, UrlError } from '$lib/server/url';
import { classify } from '$lib/server/classify';
import { savePerson } from '$lib/server/savePerson';
import { saveCompany } from '$lib/server/saveCompany';
import { checkRateLimit, LIMITS, RateLimitError } from '$lib/server/rate-limit';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'unauthorized');
  const s = requireScope(locals);
  try {
    checkRateLimit(LIMITS.save, locals.user.id);
  } catch (err) {
    if (err instanceof RateLimitError) throw error(429, 'rate_limited');
    throw err;
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'invalid_json');
  }
  if (typeof body.url !== 'string') throw error(400, 'missing_url');

  let cleaned: string;
  try {
    cleaned = cleanUrl(body.url);
  } catch (err) {
    if (err instanceof UrlError) throw error(400, err.code);
    throw err;
  }
  const u = new URL(cleaned);
  try {
    await assertPublicUrl(u);
  } catch (err) {
    if (err instanceof UrlError) throw error(400, err.code);
    throw err;
  }
  const kind = classify(u);
  const result =
    kind === 'person'
      ? await savePerson(s, cleaned)
      : await saveCompany(s, cleaned);
  return json(result, { status: result.dedup ? 200 : 201 });
};
