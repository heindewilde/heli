import type { PageServerLoad } from './$types';
import { APP_NAME } from '$lib/branding';

/**
 * The landing page a scanned pairing QR points at.
 *
 * Deliberately public and deliberately empty of data. The code lives in the URL
 * *fragment*, which browsers never send to a server — so this load cannot see
 * it, cannot log it, and cannot leak it into a `Referer`. Everything that
 * happens with the code happens in the browser or in the app.
 *
 * On a phone with the app installed, the OS resolves the link to the app
 * directly (Universal Links / App Links) and this page is never rendered. It
 * exists for the other cases: a desktop browser, a phone without the app, or a
 * scan from a camera that opens the URL rather than handing it over.
 */
export const load: PageServerLoad = async () => {
  return { appName: APP_NAME };
};
