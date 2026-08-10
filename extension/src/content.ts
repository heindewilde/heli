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

// The value of the last expression is what executeScript returns.
({ ...capture, url: location.href, adapter: adapter.id });
