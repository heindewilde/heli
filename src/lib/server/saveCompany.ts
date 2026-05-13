import { and, eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import { companies } from './schema';
import { cleanUrl, domainOf } from './url';
import { fetchOg, pickJsonLdImage, pickJsonLdString, stripSiteSuffix } from './og';
import { sanitize } from './sanitize';

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
  userId: string,
  region: string,
  rawUrl: string | null,
  manual?: ManualCompanyInput
): Promise<SaveResult> {
  const now = Date.now();
  const d = db(region);

  if (rawUrl) {
    const u = new URL(cleanUrl(rawUrl));
    const url = u.toString();
    const existing = await d
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.userId, userId), eq(companies.url, url)))
      .get();
    if (existing) return { id: existing.id, kind: 'company', dedup: true };

    const id = createId();
    await d.insert(companies).values({
      id,
      userId,
      name: domainOf(u),
      url,
      domain: domainOf(u),
      isFavorite: 0,
      isArchived: 0,
      source: 'parsing',
      createdAt: now,
      updatedAt: now
    });
    void enrichCompany(id, userId, region, u);
    return { id, kind: 'company', dedup: false };
  }

  if (!manual) throw new Error('saveCompany called without url and without manual input');
  const id = createId();
  await d.insert(companies).values({
    id,
    userId,
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
  return { id, kind: 'company', dedup: false };
}

async function enrichCompany(id: string, userId: string, region: string, url: URL): Promise<void> {
  const d = db(region);
  try {
    const og = await fetchOg(url);
    const cleanName = stripSiteSuffix(og.title, og.siteName);
    const jsonLdName = pickJsonLdString(og.jsonLd, 'name');
    const finalName =
      jsonLdName?.trim() ||
      og.siteName?.trim() ||
      cleanName?.trim() ||
      null;
    const description = og.description ? sanitize(og.description) : null;
    const logo =
      pickJsonLdImage(og.jsonLd) ||
      og.image ||
      og.faviconUrl ||
      null;

    const updates: Partial<typeof companies.$inferInsert> = {
      logoUrl: logo,
      faviconUrl: og.faviconUrl ?? null,
      description,
      source: null,
      updatedAt: Date.now()
    };
    if (finalName) updates.name = finalName;

    await d.update(companies).set(updates).where(and(eq(companies.id, id), eq(companies.userId, userId)));
  } catch (err) {
    console.warn('[heli] company enrichment failed:', (err as Error).message);
    await d
      .update(companies)
      .set({ source: null, updatedAt: Date.now() })
      .where(and(eq(companies.id, id), eq(companies.userId, userId)));
  }
}
