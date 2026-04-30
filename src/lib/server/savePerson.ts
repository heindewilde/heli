import { and, eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import { people, companies } from './schema';
import { cleanUrl, domainOf } from './url';
import { classify, deriveHandle } from './classify';
import {
  fetchOg,
  pickJsonLdImage,
  pickJsonLdString,
  pickJsonLdWorksFor,
  stripSiteSuffix
} from './og';
import { sanitize } from './sanitize';

export type SaveResult = { id: string; kind: 'person' | 'company'; dedup: boolean };

export type ManualPersonInput = {
  name: string;
  url?: string | null;
  role?: string | null;
  companyId?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  notes?: string | null;
};

export async function savePerson(
  userId: string,
  region: string,
  rawUrl: string | null,
  manual?: ManualPersonInput
): Promise<SaveResult> {
  const now = Date.now();
  const d = db(region);

  if (rawUrl) {
    const u = new URL(cleanUrl(rawUrl));
    const url = u.toString();
    const existing = await d
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.userId, userId), eq(people.url, url)))
      .get();
    if (existing) return { id: existing.id, kind: 'person', dedup: true };

    const id = createId();
    await d.insert(people).values({
      id,
      userId,
      name: deriveHandle(u) ?? u.hostname,
      url,
      domain: domainOf(u),
      handle: deriveHandle(u),
      isFavorite: 0,
      isArchived: 0,
      source: 'parsing',
      createdAt: now,
      updatedAt: now
    });
    void enrichPerson(id, userId, region, u);
    return { id, kind: 'person', dedup: false };
  }

  if (!manual) throw new Error('savePerson called without url and without manual input');
  const id = createId();
  await d.insert(people).values({
    id,
    userId,
    name: manual.name.trim(),
    role: manual.role ?? null,
    companyId: manual.companyId ?? null,
    email: manual.email ?? null,
    phone: manual.phone ?? null,
    location: manual.location ?? null,
    notes: manual.notes ? sanitize(manual.notes) : null,
    isFavorite: 0,
    isArchived: 0,
    source: 'manual',
    createdAt: now,
    updatedAt: now
  });
  return { id, kind: 'person', dedup: false };
}

async function enrichPerson(id: string, userId: string, region: string, url: URL): Promise<void> {
  const d = db(region);
  try {
    const og = await fetchOg(url);
    const cleanName = stripSiteSuffix(og.title, og.siteName);
    const jsonLdName = pickJsonLdString(og.jsonLd, 'name');
    const role = pickJsonLdString(og.jsonLd, 'jobTitle');
    const jsonLdImage = pickJsonLdImage(og.jsonLd);
    const avatar = jsonLdImage ?? og.image ?? null;
    const description = og.description ? sanitize(og.description) : null;

    const finalName = jsonLdName?.trim() || cleanName?.trim() || null;

    const updates: Partial<typeof people.$inferInsert> = {
      avatarUrl: avatar,
      faviconUrl: og.faviconUrl ?? null,
      role: role ?? null,
      notes: description,
      source: null,
      updatedAt: Date.now()
    };
    if (finalName) updates.name = finalName;

    await d.update(people).set(updates).where(and(eq(people.id, id), eq(people.userId, userId)));

    const worksFor = pickJsonLdWorksFor(og.jsonLd);
    if (worksFor?.url) {
      try {
        const employerDomain = domainOf(new URL(worksFor.url));
        const company = await d
          .select({ id: companies.id })
          .from(companies)
          .where(and(eq(companies.userId, userId), eq(companies.domain, employerDomain)))
          .get();
        if (company) {
          await d.update(people).set({ companyId: company.id }).where(eq(people.id, id));
        }
      } catch {
        // Bad URL in JSON-LD; ignore.
      }
    }
  } catch (err) {
    // Log enrichment errors in dev but don't throw — surface to user as "no enrichment yet".
    console.warn('[gusto] person enrichment failed:', (err as Error).message);
    await d
      .update(people)
      .set({ source: null, updatedAt: Date.now() })
      .where(and(eq(people.id, id), eq(people.userId, userId)));
  }
}
