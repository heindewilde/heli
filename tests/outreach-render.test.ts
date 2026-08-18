import { describe, expect, test } from 'vitest';
import {
  buildVariables,
  renderFor,
  renderTemplate,
  variableNamesFor,
  COMPANY_VARIABLES,
  PERSON_VARIABLES
} from '../src/lib/outreach/render';
import { OUTREACH_PLATFORMS, PLATFORMS } from '../src/lib/outreach/platforms';
import { INTERACTION_TYPES } from '../src/lib/interactionTypes';

const ada = {
  name: 'Ada Lovelace',
  role: 'Mathematician',
  email: 'ada@example.com',
  location: 'London',
  companyName: 'Analytical Engines'
};

const me = { name: 'Hein de Wilde', email: 'hein@example.com' };

describe('renderTemplate', () => {
  test('substitutes recipient variables', () => {
    const { text } = renderFor('Hi {{first_name}}, saw you work at {{company_name}}.', ada, me);
    expect(text).toBe('Hi Ada, saw you work at Analytical Engines.');
  });

  test('substitutes sender variables so a shared template signs itself', () => {
    const { text } = renderFor('Best,\n{{my_first_name}} ({{my_email}})', ada, me);
    expect(text).toBe('Best,\nHein (hein@example.com)');
  });

  test('whitespace inside the braces is tolerated', () => {
    expect(renderFor('Hi {{ first_name }}', ada, me).text).toBe('Hi Ada');
  });

  test('is case-insensitive on the variable name', () => {
    expect(renderFor('Hi {{First_Name}}', ada, me).text).toBe('Hi Ada');
  });

  /**
   * The whole point of the editable preview: a thin record must still produce
   * a message, with the gap visible rather than silently blank.
   */
  test('a missing field is reported and left literal, never blanked', () => {
    const thin = { name: 'Grace Hopper' };
    const { text, unresolved } = renderFor('Hi {{first_name}}, about {{company_name}}.', thin, me);
    expect(text).toBe('Hi Grace, about {{company_name}}.');
    expect(unresolved).toEqual(['company_name']);
  });

  test('an unknown variable is reported rather than swallowed', () => {
    const { text, unresolved } = renderFor('Hi {{nickname}}', ada, me);
    expect(text).toBe('Hi {{nickname}}');
    expect(unresolved).toEqual(['nickname']);
  });

  test('each unresolved name is reported once, in first-appearance order', () => {
    const thin = { name: 'Grace Hopper' };
    const { unresolved } = renderFor('{{role}} {{email}} {{role}}', thin, me);
    expect(unresolved).toEqual(['role', 'email']);
  });

  test('a value containing braces is not re-scanned', () => {
    // Substitution happens in one pass, so a person literally named
    // "{{first_name}}" cannot cause a second expansion.
    const { text } = renderFor('Hi {{first_name}}', { name: '{{my_email}} Smith' }, me);
    expect(text).toBe('Hi {{my_email}}');
  });

  /**
   * Template bodies are stored sanitized and rendered with `{@html}`. A merge
   * value comes off a person record, which is also sanitized on write — but the
   * renderer must not be the thing that introduces markup either.
   */
  test('a merge value is inserted verbatim, not interpreted', () => {
    const { text } = renderTemplate('Hi {{first_name}}', { first_name: '<script>x</script>' });
    expect(text).toBe('Hi <script>x</script>');
  });

  /**
   * Email bodies are HTML, so a merge value has to be escaped for that
   * context — "Procter & Gamble" would otherwise emit a bare ampersand.
   */
  test('escapeHtml escapes merge values for an HTML body', () => {
    const { text } = renderTemplate(
      '<p>About {{company_name}}</p>',
      { company_name: 'Procter & Gamble' },
      { escapeHtml: true }
    );
    expect(text).toBe('<p>About Procter &amp; Gamble</p>');
  });

  test('escapeHtml stops a merge value opening a tag', () => {
    const { text } = renderTemplate(
      '<p>Hi {{first_name}}</p>',
      { first_name: '<script>alert(1)</script>' },
      { escapeHtml: true }
    );
    expect(text).not.toMatch(/<script/);
    expect(text).toContain('&lt;script&gt;');
  });

  /**
   * And it must stay off for plain platforms — escaping there would put a
   * literal "&amp;" into a LinkedIn message.
   */
  test('plain platforms are not escaped', () => {
    const { text } = renderTemplate('About {{company_name}}', {
      company_name: 'Procter & Gamble'
    });
    expect(text).toBe('About Procter & Gamble');
  });

  test('the escaped value survives the round trip back to plain text', async () => {
    const { htmlToPlain } = await import('../src/lib/richText');
    const { text } = renderTemplate(
      '<p>About {{company_name}}</p>',
      { company_name: 'Procter & Gamble' },
      { escapeHtml: true }
    );
    // What the clipboard's text/plain flavour and the character counter see.
    expect(htmlToPlain(text)).toBe('About Procter & Gamble');
  });

  test('a template with no variables is returned unchanged', () => {
    const { text, unresolved } = renderFor('No variables here.', ada, me);
    expect(text).toBe('No variables here.');
    expect(unresolved).toEqual([]);
  });
});

describe('buildVariables', () => {
  test('splits a two-part name', () => {
    const v = buildVariables({ name: 'Ada Lovelace' }, me);
    expect(v.first_name).toBe('Ada');
    expect(v.last_name).toBe('Lovelace');
    expect(v.full_name).toBe('Ada Lovelace');
  });

  test('a single-word name has no last name rather than a repeated one', () => {
    const v = buildVariables({ name: 'Prince' }, me);
    expect(v.first_name).toBe('Prince');
    expect(v.last_name).toBe('');
  });

  test('a three-part name takes the final word as the surname', () => {
    const v = buildVariables({ name: 'Ada King Lovelace' }, me);
    expect(v.last_name).toBe('Lovelace');
  });

  test('PERSON_VARIABLES is the full documented set', () => {
    expect([...PERSON_VARIABLES].sort()).toEqual(
      [
        'company_name',
        'email',
        'first_name',
        'full_name',
        'last_name',
        'location',
        'my_email',
        'my_first_name',
        'my_name',
        'role'
      ].sort()
    );
  });
});

/**
 * The company arm. These pin two things that are easy to get wrong: that the
 * helper lists stay *derived* from `buildVariables` rather than hand-kept, and
 * that a person-only token in a company template is reported rather than
 * quietly resolved to something plausible.
 */
describe('buildVariables — company target', () => {
  const me = { name: 'Grace Hopper', email: 'grace@navy.mil' };
  const acme = {
    kind: 'company' as const,
    name: 'Acme Corp',
    email: 'hello@acme.com',
    location: 'Rotterdam',
    domain: 'acme.com',
    industry: 'Manufacturing',
    sizeBand: '51-200'
  };

  test('company fields resolve', () => {
    const v = buildVariables(acme, me);
    expect(v.company_name).toBe('Acme Corp');
    expect(v.domain).toBe('acme.com');
    expect(v.industry).toBe('Manufacturing');
    expect(v.size_band).toBe('51-200');
    expect(v.email).toBe('hello@acme.com');
    expect(v.location).toBe('Rotterdam');
  });

  test('sender fields resolve on both arms', () => {
    expect(buildVariables(acme, me).my_first_name).toBe('Grace');
  });

  test('COMPANY_VARIABLES is the full documented set', () => {
    expect([...COMPANY_VARIABLES].sort()).toEqual(
      [
        'company_name',
        'domain',
        'email',
        'industry',
        'location',
        'my_email',
        'my_first_name',
        'my_name',
        'size_band'
      ].sort()
    );
  });

  /**
   * The omission is the point: resolving `{{ first_name }}` to the company's
   * name would produce "Hi Acme Corp," with no warning at all.
   */
  test('person-only tokens are unresolved in a company template', () => {
    const r = renderFor('Hi {{ first_name }}, about {{ role }}…', acme, me);
    expect(r.unresolved).toEqual(['first_name', 'role']);
    expect(r.text).toContain('{{ first_name }}');
  });

  test('company-only tokens are unresolved in a person template', () => {
    const r = renderFor('Saw {{ domain }} and {{ industry }}', { name: 'Ada Lovelace' }, me);
    expect(r.unresolved).toEqual(['domain', 'industry']);
  });

  test('variableNamesFor picks the right list', () => {
    expect(variableNamesFor('person')).toBe(PERSON_VARIABLES);
    expect(variableNamesFor('company')).toBe(COMPANY_VARIABLES);
  });

  test('escapeHtml still applies on the company arm', () => {
    const r = renderFor('{{ company_name }}', { ...acme, name: 'Procter & Gamble' }, me, {
      escapeHtml: true
    });
    expect(r.text).toBe('Procter &amp; Gamble');
  });
});

describe('PLATFORMS', () => {
  test('every platform has a spec', () => {
    for (const p of OUTREACH_PLATFORMS) expect(PLATFORMS[p]).toBeDefined();
  });

  /**
   * There is no `linkedin_dm` interaction type and adding one would touch the
   * type icons, the filters and the documented API. This asserts the mapping
   * stays inside the existing vocabulary.
   */
  test('every platform logs as a real interaction type', () => {
    for (const p of OUTREACH_PLATFORMS) {
      expect(INTERACTION_TYPES).toContain(PLATFORMS[p].interactionType);
    }
  });

  test('a subject budget only exists where there is a subject', () => {
    for (const p of OUTREACH_PLATFORMS) {
      const spec = PLATFORMS[p];
      if (spec.subjectMax !== undefined) expect(spec.hasSubject).toBe(true);
    }
  });

  test('the LinkedIn connection note keeps its 300-character budget', () => {
    expect(PLATFORMS.linkedin_note.bodyMax).toBe(300);
    expect(PLATFORMS.linkedin_inmail.subjectMax).toBe(200);
    expect(PLATFORMS.linkedin_inmail.bodyMax).toBe(1900);
  });
});
