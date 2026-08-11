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
import type { Scope } from './scope';
import { bumpSearchEpoch } from './search';

export type SaveResult = { id: string; kind: 'person' | 'company'; dedup: boolean };

export type ManualPersonInput = {
  name: string;
  url?: string | null;
  role?: string | null;
  companyId?: string | null;
  /**
   * An employer *name* with no company row behind it yet — what the browser
   * extension scrapes off a profile. It lands in `suggested_company_name`, the
   * same column `enrichPerson` and the Google import write, so `/people/[id]`
   * offers to link it against a matching company. Resolving a name to a row
   * here instead would mean owning a name-matching rule at write time and
   * risking a junk company for every "Freelance" and "Self-employed".
   */
  suggestedCompanyName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  notes?: string | null;
  /**
   * A remote image URL. Cached locally before it is stored, so a record does not
   * depend on a third party keeping a hotlink alive — `enrichPerson` does the
   * same with what it finds in `og:image`.
   */
  avatarUrl?: string | null;
  linkedinUrl?: string | null;
  xUrl?: string | null;
};

const LINKEDIN_BOILERPLATE_RE = /view\s+[^.]+'s\s+(full\s+)?profile\s+on\s+linkedin/i;

function fallbackName(u: URL): string {
  return humanizeHandle(deriveHandle(u)) ?? u.hostname.replace(/^www\./, '');
}

/**
 * Hosts that serve a signed-out fetch a sign-up wall rather than the page.
 * `og.ts` keeps `AUTHWALL_PATTERNS` to *detect* one after the fact; this is the
 * cheaper front door — don't make the request at all when we already know.
 */
function servesAuthwall(u: URL): boolean {
  return /(^|\.)linkedin\.com$/.test(u.hostname.replace(/^www\./, ''));
}

/** The field names a caller actually supplied, so enrichment leaves them alone. */
function suppliedKeys(enriched: Record<string, unknown>): Set<string> {
  return new Set(
    Object.entries(enriched)
      .filter(([, v]) => v !== null && v !== '')
      .map(([k]) => k)
  );
}

export async function savePerson(
  s: Scope,
  rawUrl: string | null,
  manual?: ManualPersonInput
): Promise<SaveResult> {
  const now = Date.now();
  const d = db(s.region);

  if (rawUrl) {
    const u = new URL(cleanUrl(rawUrl));
    const url = u.toString();
    const existing = await d
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.workspaceId, s.workspaceId), eq(people.url, url)))
      .get();
    // A caller supplying `manual` alongside a URL has already read the page —
    // that is the browser extension, looking at the rendered, authenticated DOM
    // the server cannot fetch. Apply what it found instead of discarding it,
    // and don't let enrichment overwrite it (see `enrichPerson`'s `preserve`).
    const cachedAvatar = manual?.avatarUrl
      ? ((await cacheRemoteImage(manual.avatarUrl)) ?? manual.avatarUrl)
      : null;
    const enriched = manual
      ? {
          name: manual.name,
          role: manual.role ?? null,
          companyId: manual.companyId ?? null,
          suggestedCompanyName: manual.suggestedCompanyName ?? null,
          email: manual.email ?? null,
          phone: manual.phone ?? null,
          location: manual.location ?? null,
          avatarUrl: cachedAvatar,
          linkedinUrl: manual.linkedinUrl ?? null,
          xUrl: manual.xUrl ?? null,
          // Sanitized *here*, not at the call sites. `notes` is rendered with
          // `{@html}` (NotesEditor.svelte), so already-sanitized HTML is an
          // invariant the renderer depends on — and this branch was the one
          // place that skipped it, while the no-url branch below and
          // `enrichPerson` both sanitize. One authenticated `write` call with a
          // url was enough to store markup that ran for everyone in the
          // workspace.
          notes: manual.notes ? sanitize(manual.notes) : null
        }
      : null;

    if (existing) {
      // The extension's "Update" path: fill blanks and accept corrections
      // without wiping fields the caller simply did not send.
      if (enriched) {
        const patch = Object.fromEntries(
          Object.entries(enriched).filter(([, v]) => v !== null && v !== '')
        );
        if (Object.keys(patch).length > 0) {
          await d
            .update(people)
            .set({ ...patch, updatedAt: now })
            .where(eq(people.id, existing.id));
          bumpSearchEpoch(s.workspaceId);
        }
      }
      return { id: existing.id, kind: 'person', dedup: true };
    }

    const id = createId();
    await d.insert(people).values({
      id,
      workspaceId: s.workspaceId,
      userId: s.userId,
      url,
      domain: domainOf(u),
      handle: deriveHandle(u),
      ...(enriched ?? {}),
      name: enriched?.name || fallbackName(u),
      isFavorite: 0,
      isArchived: 0,
      // `parsing` hands the row to the boot janitor and shows a spinner.
      // Neither is right when the data arrived with the request.
      source: enriched ? null : 'parsing',
      createdAt: now,
      updatedAt: now
    });
    if (!enriched) {
      void enrichPerson(id, s, u);
    } else if (!servesAuthwall(u)) {
      // Enrichment still runs when the extension supplied data — it adds the
      // favicon, the social links and the postal address that a profile DOM does
      // not carry — but it must not touch what the extension already read, hence
      // `preserve`. Skipped entirely for hosts that serve *the server* an
      // authwall: there, everything it "finds" is sign-up chrome, and writing
      // that into the blank fields is worse than leaving them blank.
      void enrichPerson(id, s, u, suppliedKeys(enriched));
    }
    bumpSearchEpoch(s.workspaceId);
    return { id, kind: 'person', dedup: false };
  }

  if (!manual) throw new Error('savePerson called without url and without manual input');
  const id = createId();
  await d.insert(people).values({
    id,
    workspaceId: s.workspaceId,
    userId: s.userId,
    name: manual.name.trim(),
    role: manual.role ?? null,
    companyId: manual.companyId ?? null,
    suggestedCompanyName: manual.suggestedCompanyName ?? null,
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
  bumpSearchEpoch(s.workspaceId);
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

export async function enrichPerson(
  id: string,
  s: Scope,
  url: URL,
  /**
   * Fields the caller already filled from a source better than an OG fetch —
   * the extension reading the rendered, authenticated DOM. Enrichment adds what
   * it can around them and never overwrites them.
   */
  preserve?: Set<string>
): Promise<void> {
  const d = db(s.region);
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

    // Drop anything the caller already knew better. `source` and `updatedAt` are
    // this function's own bookkeeping and are never preserved away.
    if (preserve) {
      for (const key of preserve) {
        if (key !== 'source' && key !== 'updatedAt') delete updates[key as keyof typeof updates];
      }
    }

    await d.update(people).set(updates).where(and(eq(people.id, id), eq(people.workspaceId, s.workspaceId)));

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
          .where(and(eq(companies.workspaceId, s.workspaceId), eq(companies.domain, employerDomain)))
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
      .where(and(eq(people.id, id), eq(people.workspaceId, s.workspaceId)));
  }
  bumpSearchEpoch(s.workspaceId);
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

