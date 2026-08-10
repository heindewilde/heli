import type { RequestHandler } from './$types';
import { requireApiScope } from '$lib/server/scope';
import { apiError, apiOk } from '$lib/server/api-v1';
import { savePerson } from '$lib/server/savePerson';
import { saveCompany } from '$lib/server/saveCompany';
import { createInteraction } from '$lib/server/saveInteraction';
import { ensureTag, attachTag } from '$lib/server/tags';
import { fetchPersonRow } from '$lib/server/people-rows';
import { fetchCompanyRow } from '$lib/server/companies-rows';
import { sanitizePlainText } from '$lib/server/sanitize';
import { classify } from '$lib/server/classify';
import { cleanUrl, UrlError } from '$lib/server/url';

/**
 * The browser extension's single write.
 *
 * One request carries the parsed record, its tags and an optional note, so the
 * popup does not have to fan out to three endpoints and handle three partial
 * failures. Everything here already exists — this only sequences it.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const s = requireApiScope(locals, 'capture');

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError('invalid_request', 'Body must be JSON.', 400);
  }

  const rawUrl = body.url ? String(body.url) : null;
  let url: string | null = null;
  if (rawUrl) {
    try {
      url = cleanUrl(rawUrl);
    } catch (err) {
      return apiError('invalid_request', err instanceof UrlError ? err.message : 'Bad URL.', 400);
    }
  }

  const name = sanitizePlainText(String(body.name ?? ''), 200);
  if (!name) return apiError('invalid_request', 'A name is required.', 400);

  const kind =
    body.kind === 'person' || body.kind === 'company'
      ? body.kind
      : url
        ? classify(new URL(url))
        : 'person';

  // The extension parses the rendered, authenticated DOM, so what arrives here
  // is already enriched. Passing it as `manual` is what keeps savePerson from
  // marking the row `source: 'parsing'` and handing it to the boot janitor.
  const result =
    kind === 'person'
      ? await savePerson(s, url, {
          name,
          role: body.role ? sanitizePlainText(String(body.role), 200) : null,
          companyId: body.companyId ? String(body.companyId) : null,
          email: body.email ? sanitizePlainText(String(body.email), 254) : null,
          location: body.location ? sanitizePlainText(String(body.location), 200) : null
        })
      : await saveCompany(s, url, {
          name,
          industry: body.industry ? sanitizePlainText(String(body.industry), 200) : null,
          location: body.location ? sanitizePlainText(String(body.location), 200) : null,
          description: body.description ? String(body.description) : null
        });

  const tagNames = Array.isArray(body.tags) ? body.tags.slice(0, 12).map(String) : [];
  for (const raw of tagNames) {
    const tagName = sanitizePlainText(raw, 64);
    if (!tagName) continue;
    try {
      const tag = await ensureTag(s, kind, tagName);
      await attachTag(s, kind, result.id, tag.id);
    } catch {
      // A bad tag must not lose the capture itself.
    }
  }

  const note = body.note ? String(body.note).trim() : '';
  let interactionId: string | null = null;
  if (note) {
    const created = await createInteraction(s, {
      type: 'note',
      title: `Note on ${name}`,
      body: note,
      occurredAt: Date.now(),
      personIds: kind === 'person' ? [result.id] : [],
      companyId: kind === 'company' ? result.id : null
    });
    interactionId = created.id;
  }

  const row =
    kind === 'person' ? await fetchPersonRow(s, result.id) : await fetchCompanyRow(s, result.id);

  return apiOk(
    {
      id: result.id,
      kind,
      dedup: result.dedup,
      href: kind === 'person' ? `/people/${result.id}` : `/companies/${result.id}`,
      interactionId,
      row
    },
    { status: result.dedup ? 200 : 201 }
  );
};
