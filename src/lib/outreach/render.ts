/**
 * Template variable substitution.
 *
 * Dependency-free and imported by both the browser and the server, the same
 * arrangement as `cleanUrl.ts`. The browser is where it actually runs: the
 * clipboard write has to happen inside the user's click, and Safari invalidates
 * the gesture across an `await`, so rendering has to be synchronous and local.
 * The server side exists so tests can pin the behaviour without a DOM.
 */

/** `{{ first_name }}` — whitespace inside the braces is tolerated. */
const TOKEN = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

export type Recipient = {
  name: string;
  role?: string | null;
  email?: string | null;
  location?: string | null;
  companyName?: string | null;
};

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
  return {
    first_name: firstName(to.name),
    last_name: lastName(to.name),
    full_name: to.name.trim(),
    role: to.role ?? '',
    email: to.email ?? '',
    location: to.location ?? '',
    company_name: to.companyName ?? '',
    // Sender fields are what let one shared template sign itself correctly for
    // whoever is actually sending it.
    my_first_name: firstName(from.name),
    my_name: from.name.trim(),
    my_email: from.email
  };
}

/** Every variable a template may reference, for the editor's helper list. */
export const VARIABLE_NAMES = Object.keys(
  buildVariables({ name: '' }, { name: '', email: '' })
) as readonly string[];

export function renderTemplate(body: string, vars: Record<string, string>): RenderResult {
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
    return value;
  });

  return { text, unresolved };
}

/** Convenience for the common case of rendering against a person. */
export function renderFor(
  body: string,
  to: Recipient,
  from: Sender
): RenderResult {
  return renderTemplate(body, buildVariables(to, from));
}
