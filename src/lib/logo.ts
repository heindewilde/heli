import { env } from '$env/dynamic/public';

export type LogoTheme = 'light' | 'dark';
export type LogoFormat = 'webp' | 'png' | 'jpg';

export type LogoOptions = {
  size?: number;
  theme?: LogoTheme;
  format?: LogoFormat;
  retina?: boolean;
};

export function logoDevUrl(
  domain: string | null | undefined,
  opts: LogoOptions = {}
): string | null {
  const key = env.PUBLIC_LOGODEV_KEY;
  if (!key || !domain) return null;
  const host = domain
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./i, '')
    .toLowerCase();
  if (!host) return null;
  const params = new URLSearchParams({
    token: key,
    size: String(opts.size ?? 72),
    format: opts.format ?? 'webp',
    theme: opts.theme ?? 'light',
    retina: String(opts.retina ?? true),
    fallback: '404'
  });
  return `https://img.logo.dev/${encodeURIComponent(host)}?${params.toString()}`;
}
