/**
 * Template variable substitution.
 *
 * Dependency-free and imported by both the browser and the server, the same
 * arrangement as `cleanUrl.ts`. The browser is where it actually runs: the
 * clipboard write has to happen inside the user's click, and Safari invalidates
 * the gesture across an `await`, so rendering has to be synchronous and local.
 * The server side exists so tests can pin the behaviour without a DOM.
 */

import type { OutreachTarget } from './platforms';

/** `{{ first_name }}` — whitespace inside the braces is tolerated. */
const TOKEN = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

/**
 * A person recipient. `kind` is optional here and *required* on the company
 * arm, and that asymmetry is load-bearing: it is what lets every existing call
 * site — the dialog, the run screen, the samples, `outreach-recipients.ts` —
 * keep passing a bare object and still narrow to this arm. Do not "tidy" it by
 * making `kind` required on both.
 */
export type PersonRecipient = {
  kind?: 'person';
  name: string;
  role?: string | null;
  email?: string | null;
  location?: string | null;
  companyName?: string | null;
};

/**
 * A company recipient. `name` is the company's name, and `company_name`
 * resolves to it too, so a template can address the reader as "the {{ role }}
 * at {{ company_name }}" or just write to {{ full_name }} — except that
 * `full_name` deliberately does not exist here. See `buildVariables`.
 */
export type CompanyRecipient = {
  kind: 'company';
  name: string;
  email?: string | null;
  location?: string | null;
  domain?: string | null;
  industry?: string | null;
  sizeBand?: string | null;
};

export type Recipient = PersonRecipient | CompanyRecipient;

export type Sender = {
  name: string;
  email: string;
};

export type RenderResult = {
  text: string;
  /**
   * Variables that resolved to nothing, in first-appearance order. The token is
   * left in the output verbatim so the preview can show where the gap is and
   * the user can type over it.
   */
  unresolved: string[];
};

/**
 * The first whitespace-separated word of a name.
 *
 * Gets "Dr. Anna Smith" wrong, and deliberately so: the preview is editable, so
 * a wrong guess costs one correction, while a title-stripping heuristic would
 * be wrong in ways nobody can predict from the template.
 */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function buildVariables(to: Recipient, from: Sender): Record<string, string> {
  const shared = {
    email: to.email ?? '',
    location: to.location ?? '',
    // Sender fields are what let one shared template sign itself correctly for
    // whoever is actually sending it.
    my_first_name: firstName(from.name),
    my_name: from.name.trim(),
    my_email: from.email
  };

  if (to.kind === 'company') {
    return {
      ...shared,
      company_name: to.name.trim(),
      domain: to.domain ?? '',
      industry: to.industry ?? '',
      size_band: to.sizeBand ?? ''
    };
    // No `first_name`, `last_name`, `full_name` or `role`, and that omission is
    // the feature: a company has none of them, so `{{ first_name }}` left in a
    // template that was switched to a company target lands in `unresolved` and
    // raises the warning strip. Resolving it to the company's name instead
    // would produce "Hi Acme," and no warning at all.
  }

  return {
    ...shared,
    first_name: firstName(to.name),
    last_name: lastName(to.name),
    full_name: to.name.trim(),
    role: to.role ?? '',
    company_name: to.companyName ?? ''
  };
}

/**
 * The editor's helper lists, still *derived* from `buildVariables` rather than
 * hand-kept — so a variable added above cannot fail to appear in the editor,
 * and one removed cannot linger there.
 */
export const PERSON_VARIABLES = Object.keys(
  buildVariables({ name: '' }, { name: '', email: '' })
) as readonly string[];

export const COMPANY_VARIABLES = Object.keys(
  buildVariables({ kind: 'company', name: '' }, { name: '', email: '' })
) as readonly string[];

export function variableNamesFor(target: OutreachTarget): readonly string[] {
  return target === 'company' ? COMPANY_VARIABLES : PERSON_VARIABLES;
}

export type RenderOptions = {
  /**
   * Escape merge values for an HTML context.
   *
   * Required whenever the template body *is* markup — an email template. The
   * values are plain text off a person record, so a company called
   * "Procter & Gamble" would otherwise emit a bare `&` into HTML, and a name
   * containing `<` would open a tag. Off for plain-text platforms, where
   * escaping would put `&amp;` into a LinkedIn message.
   */
  escapeHtml?: boolean;
};

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderTemplate(
  body: string,
  vars: Record<string, string>,
  opts: RenderOptions = {}
): RenderResult {
  const unresolved: string[] = [];

  const text = body.replace(TOKEN, (match, rawName: string) => {
    const name = rawName.toLowerCase();
    const value = vars[name];
    // An unknown variable and an empty one are the same thing to the person
    // looking at the preview: something to fill in.
    if (!value) {
      if (!unresolved.includes(name)) unresolved.push(name);
      return match;
    }
    return opts.escapeHtml ? escape(value) : value;
  });

  return { text, unresolved };
}

/** Convenience for the common case of rendering against a person. */
export function renderFor(
  body: string,
  to: Recipient,
  from: Sender,
  opts: RenderOptions = {}
): RenderResult {
  return renderTemplate(body, buildVariables(to, from), opts);
}
