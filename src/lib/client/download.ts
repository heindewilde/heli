/**
 * Save a fetched response to a file.
 *
 * The header Export links are plain `<a href>` and need none of this — the
 * browser downloads them because the endpoint sets `content-disposition`. This
 * exists for the *selection* export, where the id list can run to hundreds of
 * entries and does not fit in a URL, so the request has to be a POST and the
 * response arrives in JavaScript instead of in the address bar.
 *
 * Two constraints, both of which have bitten this app before in other guises:
 *
 *  - **An object URL, not a `data:` URL.** `URL.createObjectURL` works outside a
 *    secure context, which is the plain-HTTP LAN self-host that
 *    `client/clipboard.ts` also exists for, and carries no length ceiling.
 *  - **Revoke on a later task, never straight after `click()`.** Firefox and
 *    Safari cancel an in-flight download when the URL it points at is revoked in
 *    the same task, which fails as a file that never appears rather than as an
 *    error.
 */

/** `attachment; filename="heli-people-2026-08-27.csv"` → the filename. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const quoted = header.match(/filename="([^"]+)"/);
  if (quoted) return quoted[1];
  const bare = header.match(/filename=([^;]+)/);
  return bare ? bare[1].trim() : null;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // See the docblock: revoking synchronously cancels the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * POST a body and save the CSV that comes back. Returns false rather than
 * throwing so the caller can `toast.danger()` — the server owns the filename,
 * and `fallbackName` only covers a response with no `content-disposition`.
 */
export async function downloadPost(
  url: string,
  body: unknown,
  fallbackName: string
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) return false;
    const name = filenameFromDisposition(res.headers.get('content-disposition')) ?? fallbackName;
    downloadBlob(await res.blob(), name);
    return true;
  } catch {
    return false;
  }
}
