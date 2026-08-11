/**
 * Injected on demand by the popup — there is no `<all_urls>` host permission
 * and no persistent content script. Chrome shows "runs on click only", which is
 * the honest description and a real trust win for a tool that reads pages.
 */
import { pickAdapter } from './adapters';
// The app's own normaliser, imported rather than copied (see extension/tsconfig.json).
// These rules decide whether two spellings of a LinkedIn URL are the same
// record, so the extension and the server have to agree exactly —
// `tests/extension-adapters.test.ts` asserts they do.
import { cleanUrl } from '../../src/lib/cleanUrl';

function safeClean(href: string): string {
  try {
    return cleanUrl(href);
  } catch {
    return href;
  }
}

const url = new URL(location.href);
const adapter = pickAdapter(url);
const capture = adapter.parse(document, url);

if (localStorage.getItem('__heli_debug')) {
  // Which strategy produced each field. The first thing to look at when a site
  // changes its markup.
  console.log('[heli] adapter:', adapter.id, capture.via);
}

// Hand the result back through a global rather than the script's completion
// value. `executeScript({ files })` returns that completion value, but esbuild
// wraps this module in an IIFE (it has imports, so it must be bundled), and the
// completion value of `(() => { … })();` is the call's own result — undefined.
// The popup reads this global back with a second, tiny executeScript.
(window as unknown as { __heliCapture?: unknown }).__heliCapture = {
  ...capture,
  // Normalised here rather than left to the server. Both `/lookup` and
  // `/capture` clean what they receive, so dedup was already correct either
  // way — but the raw href carries whatever tracking parameters the page was
  // opened with, and there is no reason to send those off the machine.
  //
  // `cleanUrl` throws on input it cannot parse. The popup has already checked
  // this is an http(s) page, so that should be unreachable — but a throw here
  // leaves `__heliCapture` unset and the popup reports "Could not read this
  // page", turning a normalisation detail into a dead end. Fall back instead.
  url: safeClean(location.href),
  adapter: adapter.id
};
