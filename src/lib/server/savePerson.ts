import { and, eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from './db';
import { people, companies } from './schema';
import { cleanUrl, domainOf } from './url';
import { deriveHandle, humanizeHandle } from './classify';
import {
  fetchOg,
  pickJsonLdAddress,
  pickJsonLdContact,
  pickJsonLdImage,
  pickJsonLdString,
  pickJsonLdWorksFor,
  stripCompanySuffix,
  stripSiteSuffix
} from './og';
import { sanitize } from './sanitize';
import { cacheRemoteImage } from './imageCache';

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

const LINKEDIN_BOILERPLATE_RE = /view\s+[^.]+'s\s+(full\s+)?profile\s+on\s+linkedin/i;

function fallbackName(u: URL): string {
  return humanizeHandle(deriveHandle(u)) ?? u.hostname.replace(/^www\./, '');
}

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
      name: fallbackName(u),
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

function cleanDescription(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (LINKEDIN_BOILERPLATE_RE.test(trimmed)) return null;
  const capped = trimmed.length > 280 ? trimmed.slice(0, 280).replace(/\s+\S*$/, '') + '…' : trimmed;
  return sanitize(capped);
}

export async function enrichPerson(id: string, userId: string, region: string, url: URL): Promise<void> {
  const d = db(region);
  try {
    const og = await fetchOg(url);

    // Extract employer first so we can use it to strip the company name out
    // of the person's title — LinkedIn often serves "Name - Company" or
    // "Name | Company" as og:title, and we don't want that ending up in `name`.
    const worksFor = pickJsonLdWorksFor(og.jsonLd);
    const employerName = worksFor?.name?.trim() ?? null;

    const titleClean = stripCompanySuffix(stripSiteSuffix(og.title, og.siteName), employerName);
    const ldNameRaw = pickJsonLdString(og.jsonLd, 'name');
    const ldNameClean = stripCompanySuffix(stripSiteSuffix(ldNameRaw, og.siteName), employerName);
    const role = pickJsonLdString(og.jsonLd, 'jobTitle');
    const jsonLdImage = pickJsonLdImage(og.jsonLd);
    const remoteAvatar = jsonLdImage ?? og.image ?? null;
    const cachedAvatar = await cacheRemoteImage(remoteAvatar);
    const avatar = cachedAvatar ?? remoteAvatar;

    const description = cleanDescription(
      pickJsonLdString(og.jsonLd, 'description') ?? og.description
    );

    const jsonLdAddress = pickJsonLdAddress(og.jsonLd) ?? og.address;
    const contact = pickJsonLdContact(og.jsonLd);

    const finalName = ldNameClean?.trim() || titleClean?.trim() || null;

    const hostNow = url.hostname.toLowerCase().replace(/^www\./, '');
    const linkedinUrl =
      og.socials?.linkedinUrl && !hostNow.endsWith('linkedin.com') ? og.socials.linkedinUrl : null;
    const xUrl =
      og.socials?.xUrl && hostNow !== 'x.com' && hostNow !== 'twitter.com' ? og.socials.xUrl : null;

    const updates: Partial<typeof people.$inferInsert> = {
      avatarUrl: avatar,
      faviconUrl: og.faviconUrl ?? null,
      role: role ?? null,
      notes: description,
      location: jsonLdAddress ?? null,
      email: contact.email ?? null,
      phone: contact.telephone ?? null,
      linkedinUrl,
      xUrl,
      source: null,
      updatedAt: Date.now()
    };
    if (finalName) updates.name = finalName;

    await d.update(people).set(updates).where(and(eq(people.id, id), eq(people.userId, userId)));

    if (worksFor?.url) {
      try {
        // If the employer URL is a LinkedIn company page, try once to resolve
        // it to the company's real website — so the "Add company" suggestion
        // saves a URL that can be properly enriched (industry, location, etc).
        let resolvedUrl = worksFor.url;
        try {
          const employerUrl = new URL(worksFor.url);
          if (employerUrl.hostname.toLowerCase().replace(/^www\./, '').endsWith('linkedin.com')) {
            const website = await resolveCompanyWebsite(employerUrl);
            if (website) resolvedUrl = website;
          }
        } catch {
          // Bad URL; keep original.
        }
        const employerDomain = domainOf(new URL(resolvedUrl));
        const company = await d
          .select({ id: companies.id })
          .from(companies)
          .where(and(eq(companies.userId, userId), eq(companies.domain, employerDomain)))
          .get();
        if (company) {
          await d
            .update(people)
            .set({
              companyId: company.id,
              suggestedCompanyName: null,
              suggestedCompanyUrl: null
            })
            .where(eq(people.id, id));
        } else if (worksFor.name) {
          await d
            .update(people)
            .set({
              suggestedCompanyName: worksFor.name.trim(),
              suggestedCompanyUrl: resolvedUrl
            })
            .where(eq(people.id, id));
        }
      } catch {
        // Bad URL in JSON-LD; ignore.
      }
    } else if (worksFor?.name) {
      await d
        .update(people)
        .set({ suggestedCompanyName: worksFor.name.trim(), suggestedCompanyUrl: null })
        .where(eq(people.id, id));
    }
  } catch (err) {
    // Log enrichment errors in dev but don't throw — surface to user as "no enrichment yet".
    console.warn('[heli] person enrichment failed:', (err as Error).message);
    await d
      .update(people)
      .set({ source: null, updatedAt: Date.now() })
      .where(and(eq(people.id, id), eq(people.userId, userId)));
  }
}

// Fetch a LinkedIn company page once and try to find the company's real
// website. Looks at JSON-LD `Organization.url`, then `sameAs` for the first
// non-LinkedIn http(s) URL. Returns null on any failure — caller falls back
// to the LinkedIn URL.
async function resolveCompanyWebsite(linkedinUrl: URL): Promise<string | null> {
  try {
    const og = await fetchOg(linkedinUrl);
    const orgUrl = pickJsonLdString(og.jsonLd, 'url');
    if (orgUrl) {
      try {
        const u = new URL(orgUrl);
        const host = u.hostname.toLowerCase().replace(/^www\./, '');
        if (host && !host.endsWith('linkedin.com') && (u.protocol === 'http:' || u.protocol === 'https:')) {
          return u.toString();
        }
      } catch {
        // bad url
      }
    }
    const sameAs = (og.jsonLd as Record<string, unknown> | null)?.sameAs;
    const arr = Array.isArray(sameAs) ? sameAs : typeof sameAs === 'string' ? [sameAs] : [];
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      try {
        const u = new URL(item);
        const host = u.hostname.toLowerCase().replace(/^www\./, '');
        if (
          (u.protocol === 'http:' || u.protocol === 'https:') &&
          host &&
          !host.endsWith('linkedin.com') &&
          host !== 'x.com' &&
          host !== 'twitter.com' &&
          host !== 'facebook.com' &&
          host !== 'instagram.com' &&
          host !== 'youtube.com'
        ) {
          return u.toString();
        }
      } catch {
        // ignore
      }
    }
    return null;
  } catch {
    return null;
  }
}

