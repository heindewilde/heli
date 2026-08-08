import { and, eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import { companies } from './schema';
import { cleanUrl, domainOf } from './url';
import {
  fetchOg,
  pickJsonLdAddress,
  pickJsonLdIndustry,
  pickJsonLdSize,
  pickJsonLdString,
  stripSiteSuffix,
  type OgData
} from './og';
import { sanitize } from './sanitize';
import type { Scope } from './scope';
import { bumpSearchEpoch } from './search';

export type SaveResult = { id: string; kind: 'company'; dedup: boolean };

export type ManualCompanyInput = {
  name: string;
  url?: string | null;
  industry?: string | null;
  location?: string | null;
  description?: string | null;
  notes?: string | null;
};

export async function saveCompany(
  s: Scope,
  rawUrl: string | null,
  manual?: ManualCompanyInput
): Promise<SaveResult> {
  const now = Date.now();
  const d = db(s.region);

  if (rawUrl) {
    const u = new URL(cleanUrl(rawUrl));
    const url = u.toString();
    const existing = await d
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.workspaceId, s.workspaceId), eq(companies.url, url)))
      .get();
    if (existing) return { id: existing.id, kind: 'company', dedup: true };

    const id = createId();
    await d.insert(companies).values({
      id,
      workspaceId: s.workspaceId,
      userId: s.userId,
      name: domainOf(u),
      url,
      domain: domainOf(u),
      isFavorite: 0,
      isArchived: 0,
      source: 'parsing',
      createdAt: now,
      updatedAt: now
    });
    void enrichCompany(id, s, u);
    bumpSearchEpoch(s.workspaceId);
    return { id, kind: 'company', dedup: false };
  }

  if (!manual) throw new Error('saveCompany called without url and without manual input');
  const id = createId();
  await d.insert(companies).values({
    id,
    workspaceId: s.workspaceId,
    userId: s.userId,
    name: manual.name.trim(),
    industry: manual.industry ?? null,
    location: manual.location ?? null,
    description: manual.description ? sanitize(manual.description) : null,
    notes: manual.notes ? sanitize(manual.notes) : null,
    isFavorite: 0,
    isArchived: 0,
    source: 'manual',
    createdAt: now,
    updatedAt: now
  });
  bumpSearchEpoch(s.workspaceId);
  return { id, kind: 'company', dedup: false };
}

function isDeepPath(u: URL): boolean {
  return u.pathname.split('/').filter(Boolean).length > 0;
}

function hasOrganizationJsonLd(og: OgData | null): boolean {
  if (!og?.jsonLd) return false;
  const t = (og.jsonLd as Record<string, unknown>)['@type'];
  if (typeof t === 'string') {
    return ['Organization', 'Corporation', 'LocalBusiness', 'NewsMediaOrganization', 'EducationalOrganization'].includes(t);
  }
  if (Array.isArray(t)) {
    return t.some((x) => typeof x === 'string' && ['Organization', 'Corporation', 'LocalBusiness'].includes(x));
  }
  return false;
}

function mergeOg(deep: OgData, root: OgData): OgData {
  // Root JSON-LD wins (canonical Organization schema usually lives on /).
  // Deep page wins for description/image (more specific to what the user pasted).
  return {
    title: deep.title || root.title,
    description: deep.description || root.description,
    image: deep.image || root.image,
    siteName: root.siteName || deep.siteName,
    faviconUrl: deep.faviconUrl || root.faviconUrl,
    canonicalUrl: deep.canonicalUrl || root.canonicalUrl,
    jsonLd: root.jsonLd ?? deep.jsonLd,
    socials: {
      linkedinUrl: deep.socials?.linkedinUrl ?? root.socials?.linkedinUrl,
      xUrl: deep.socials?.xUrl ?? root.socials?.xUrl
    },
    address: root.address ?? deep.address,
    industry: root.industry ?? deep.industry,
    sizeBand: root.sizeBand ?? deep.sizeBand,
    email: root.email ?? deep.email,
    phone: root.phone ?? deep.phone
  };
}

function cleanDescription(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const capped = trimmed.length > 400 ? trimmed.slice(0, 400).replace(/\s+\S*$/, '') + '…' : trimmed;
  return sanitize(capped);
}

export async function enrichCompany(id: string, s: Scope, url: URL): Promise<void> {
  const d = db(s.region);
  try {
    let og = await fetchOg(url);

    // If the user pasted a deep page and we didn't get a canonical Organization
    // JSON-LD, try the root once — marketing sites usually expose the full
    // Organization schema on `/`.
    if (isDeepPath(url) && !hasOrganizationJsonLd(og) && !og.siteName) {
      const root = new URL('/', url);
      try {
        const rootOg = await fetchOg(root);
        og = mergeOg(og, rootOg);
      } catch {
        // Root fetch is best-effort.
      }
    }

    const cleanName = stripSiteSuffix(og.title, og.siteName);
    const jsonLdName = pickJsonLdString(og.jsonLd, 'name');
    const finalName =
      jsonLdName?.trim() ||
      og.siteName?.trim() ||
      cleanName?.trim() ||
      null;

    const description = cleanDescription(pickJsonLdString(og.jsonLd, 'description') ?? og.description);
    const industry = og.industry ?? pickJsonLdIndustry(og.jsonLd) ?? null;
    const sizeBand = og.sizeBand ?? pickJsonLdSize(og.jsonLd) ?? null;
    const location = og.address ?? pickJsonLdAddress(og.jsonLd) ?? null;

    const hostNow = url.hostname.toLowerCase().replace(/^www\./, '');
    const linkedinUrl =
      og.socials?.linkedinUrl && !hostNow.endsWith('linkedin.com') ? og.socials.linkedinUrl : null;
    const xUrl =
      og.socials?.xUrl && hostNow !== 'x.com' && hostNow !== 'twitter.com' ? og.socials.xUrl : null;

    // Logo comes from Logo.dev (client-side, derived from `domain`). Don't
    // persist OG image to logoUrl — it would override the Logo.dev URL with
    // a stale CDN-signed asset.
    const updates: Partial<typeof companies.$inferInsert> = {
      faviconUrl: og.faviconUrl ?? null,
      description,
      industry,
      sizeBand,
      location,
      linkedinUrl,
      xUrl,
      source: null,
      updatedAt: Date.now()
    };
    if (finalName) updates.name = finalName;

    await d.update(companies).set(updates).where(and(eq(companies.id, id), eq(companies.workspaceId, s.workspaceId)));
  } catch (err) {
    console.warn('[heli] company enrichment failed:', (err as Error).message);
    await d
      .update(companies)
      .set({ source: null, updatedAt: Date.now() })
      .where(and(eq(companies.id, id), eq(companies.workspaceId, s.workspaceId)));
  }
  bumpSearchEpoch(s.workspaceId);
}
