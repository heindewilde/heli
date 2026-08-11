/**
 * Copy a message to the clipboard in both flavours.
 *
 * Two constraints shape this. The write has to stay inside the user's click:
 * Safari invalidates the gesture across an `await`, and its escape hatch —
 * passing a `Promise<Blob>` to `ClipboardItem` — is rejected by Firefox, which
 * requires a real Blob. There is no portable async path, which is why the
 * message is rendered in the browser before Copy is ever pressed.
 *
 * And `navigator.clipboard` is *undefined*, not a rejected promise, outside a
 * secure context — which includes `http://<ip>:3000`, the docker-compose
 * quickstart before Caddy and DNS are in front of it, and any LAN self-host.
 * The fallback there can only carry one flavour; callers say so in the UI.
 */

export type CopyResult = 'rich' | 'plain-only' | 'failed';

function legacyCopy(text: string): boolean {
  // execCommand is deprecated and is the only thing that works without a
  // secure context. It cannot carry text/html.
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  try {
    el.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    el.remove();
  }
}

/** Plain text only — for platforms whose composer discards formatting anyway. */
export async function copyText(text: string): Promise<CopyResult> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'plain-only';
    }
  } catch {
    // Fall through to the legacy path rather than reporting failure.
  }
  return legacyCopy(text) ? 'plain-only' : 'failed';
}

/** Both flavours, so an email client keeps the formatting and everything else gets text. */
export async function copyRich(html: string, plain: string): Promise<CopyResult> {
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' })
        })
      ]);
      return 'rich';
    }
  } catch {
    // Some browsers refuse text/html from a non-user-initiated context, and
    // Linux Firefox has historically refused it outright. Plain text is a
    // better outcome than nothing.
  }
  return copyText(plain);
}
