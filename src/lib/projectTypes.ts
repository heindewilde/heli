// The project vocabulary — type, billing shape, link grouping — with no
// dependencies.
//
// Split out of `schema.ts` for the same reason `interactionTypes.ts` was split
// out of `interactions.ts`, only in the other direction: the *client* needs
// these lists (the type filter on /projects, the billing editor on a project
// page, the link grouping), and importing them from `schema.ts` would pull
// Drizzle into the browser bundle. `schema.ts` imports and re-exports them, so
// every existing `from './schema'` keeps working.
//
// No lucide imports here — icons live at the call site, the same split as
// outreach/platforms.ts vs platformIcons.ts.

/**
 * What the work *is*. Deliberately a short fixed list with an escape hatch
 * rather than a workspace-editable table: filters stay cheap, and nobody is
 * forced to lie about a project to save it.
 */
export const PROJECT_TYPES = ['client', 'internal', 'personal', 'pro_bono', 'other'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  client: 'Client',
  internal: 'Internal',
  personal: 'Personal',
  pro_bono: 'Pro bono',
  other: 'Other'
};

export function isProjectType(v: unknown): v is ProjectType {
  return typeof v === 'string' && (PROJECT_TYPES as readonly string[]).includes(v);
}

/**
 * How the work is *billed*.
 *
 * `retainer` is separate from `fixed` because a retainer recurs: it carries
 * `monthly_fee` rather than `fixed_fee`, and — like `hourly` — it makes tracked
 * time billable by default.
 */
export const BILLING_TYPES = ['none', 'hourly', 'fixed', 'retainer'] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  none: 'Not billed',
  hourly: 'Hourly',
  fixed: 'Fixed fee',
  retainer: 'Retainer'
};

export function isBillingType(v: unknown): v is BillingType {
  return typeof v === 'string' && (BILLING_TYPES as readonly string[]).includes(v);
}

/**
 * Which money column a billing type uses. The single source of truth for the
 * cross-field rule in saveProject.ts — every other column is nulled on change,
 * so a stale rate can never survive a switch from hourly to fixed.
 */
export const BILLING_MONEY_FIELD: Record<BillingType, 'hourlyRate' | 'fixedFee' | 'monthlyFee' | null> =
  {
    none: null,
    hourly: 'hourlyRate',
    fixed: 'fixedFee',
    retainer: 'monthlyFee'
  };

/** Tracked time on these projects is billable unless the entry says otherwise. */
export function billingImpliesBillable(t: BillingType): boolean {
  return t === 'hourly' || t === 'retainer';
}

/** Grouping for project links. NULL on a row reads as 'other'. */
export const LINK_KINDS = ['doc', 'design', 'repo', 'folder', 'board', 'other'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  doc: 'Docs',
  design: 'Design',
  repo: 'Code',
  folder: 'Files',
  board: 'Boards',
  other: 'Links'
};

export function isLinkKind(v: unknown): v is LinkKind {
  return typeof v === 'string' && (LINK_KINDS as readonly string[]).includes(v);
}

/** A link with no kind groups under 'other' rather than vanishing. */
export function linkKindOf(v: string | null | undefined): LinkKind {
  return isLinkKind(v) ? v : 'other';
}

/**
 * A best-effort kind for a freshly pasted URL, so the common cases classify
 * themselves and the picker starts on the right answer. Host matching only —
 * this is a default, not a claim, and the user can always change it.
 */
export function guessLinkKind(url: string): LinkKind {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  if (/(^|\.)(github|gitlab|bitbucket)\.com$/.test(host)) return 'repo';
  if (/(^|\.)(figma|sketch|canva|dribbble)\.com$/.test(host)) return 'design';
  if (/(^|\.)(notion\.so|docs\.google\.com|coda\.io|hackmd\.io)$/.test(host)) return 'doc';
  if (/(^|\.)(drive\.google\.com|dropbox\.com|box\.com|onedrive\.live\.com)$/.test(host))
    return 'folder';
  if (/(^|\.)(linear\.app|trello\.com|asana\.com|monday\.com|clickup\.com|height\.app)$/.test(host))
    return 'board';
  return 'other';
}
