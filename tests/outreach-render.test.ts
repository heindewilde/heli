import { describe, expect, test } from 'vitest';
import { buildVariables, renderFor, renderTemplate, VARIABLE_NAMES } from '../src/lib/outreach/render';
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

  test('VARIABLE_NAMES is the full documented set', () => {
    expect([...VARIABLE_NAMES].sort()).toEqual(
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
