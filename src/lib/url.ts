// Compose a `${base}?…` URL from the current URL's params plus overrides.
// `null | false | ''` deletes a key; `true` becomes `'1'`. Other values are
// stringified. Same shape as the per-page buildUrl that used to be inline
// in every list page.
export function buildUrl(
  base: string,
  current: URLSearchParams,
  overrides: Record<string, string | boolean | null>
): string {
  const params = new URLSearchParams(current);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === false || v === '') params.delete(k);
    else params.set(k, v === true ? '1' : v);
  }
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}
