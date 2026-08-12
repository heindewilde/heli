import type { RequestHandler } from './$types';
import { requireScope } from '$lib/server/scope';
import { apiOk, denyBearer } from '$lib/server/api-v1';
import { createPairing } from '$lib/server/devices';
import { encodeQr } from '$lib/server/qr';
import { checkRateLimit, LIMITS } from '$lib/server/rate-limit';

/**
 * Mint a pairing code.
 *
 * Cookie-session only. `denyBearer` is what makes the whole device design safe
 * to hand out: a paired phone cannot mint a second credential, so a stolen
 * device is contained by revoking it from the web, and there is no path from
 * one compromised credential to a fresh one.
 *
 * The code is returned exactly once, in plaintext, and stored only as a hash.
 */
export const POST: RequestHandler = async ({ locals, url }) => {
  const denied = denyBearer(locals);
  if (denied) return denied;
  const s = requireScope(locals);
  checkRateLimit(LIMITS.devicePair, s.userId);

  const { code, expiresAt } = await createPairing(s);

  /**
   * The payload is a URL so a system camera acts on it without the app being
   * involved, and the origin travels *inside* it — which is what makes this work
   * for a self-hoster with no typing at all.
   *
   * The code sits in the **fragment**. A fragment is never sent to the server,
   * so a live credential cannot end up in an access log, a `Referer`, or a proxy
   * trace on the way to `/pair`.
   */
  const pairUrl = `${url.origin}/pair#c=${code}`;

  // The matrix is built here rather than in the browser: an encoder in the
  // client bundle would be measured by scripts/check-budget.ts on every page,
  // for a screen most people open twice. A boolean grid also means the settings
  // page renders <rect> elements instead of {@html}, so there is no sanitize
  // question to get wrong.
  return apiOk({ code, expiresAt, url: pairUrl, qr: encodeQr(pairUrl) }, { status: 201 });
};
