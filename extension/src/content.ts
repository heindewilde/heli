/**
 * Injected on demand by the popup — there is no `<all_urls>` host permission
 * and no persistent content script. Chrome shows "runs on click only", which is
 * the honest description and a real trust win for a tool that reads pages.
 */
import { pickAdapter } from './adapters';

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
  url: location.href,
  adapter: adapter.id
};
