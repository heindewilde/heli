// Simple opaque-string cursor for createdAt-tiebroken-by-id pagination.
// Encoding is intentionally trivial — cursors aren't secrets, they only need
// to round-trip through a URL query parameter.

export function encodeCursor(createdAt: number, id: string): string {
  return `${createdAt}_${id}`;
}

export function decodeCursor(raw: string | null | undefined): {
  createdAt: number;
  id: string;
} | null {
  if (!raw) return null;
  const idx = raw.indexOf('_');
  if (idx < 1) return null;
  const ts = Number.parseInt(raw.slice(0, idx), 10);
  const id = raw.slice(idx + 1);
  if (!Number.isFinite(ts) || !id) return null;
  return { createdAt: ts, id };
}
