import { expect, test } from 'vitest';
import { parse } from 'node-html-parser';
import { pickContactEmail, pickContactUrl } from '../src/lib/server/og';

/**
 * The allowlist is the whole design here. A company page links plenty of
 * addresses, and writing cold outreach to a named employee's inbox — or to
 * `no-reply@` — is worse than having no address at all. Same reasoning that
 * keeps a guessed employer off a LinkedIn profile: wrong beats blank.
 */

const doc = (html: string) => parse(html);

test('takes a generic front-desk address', () => {
  expect(pickContactEmail(doc('<a href="mailto:hello@acme.com">Say hi</a>'))).toBe('hello@acme.com');
  expect(pickContactEmail(doc('<a href="mailto:INFO@Acme.com">Mail</a>'))).toBe('info@acme.com');
  expect(pickContactEmail(doc('<a href="mailto:sales@acme.com?subject=Hi">x</a>'))).toBe(
    'sales@acme.com'
  );
});

test('accepts a suffixed front-desk address', () => {
  // `sales.eu@` and `info-uk@` are still the front desk.
  expect(pickContactEmail(doc('<a href="mailto:sales.eu@acme.com">x</a>'))).toBe('sales.eu@acme.com');
  expect(pickContactEmail(doc('<a href="mailto:info-uk@acme.com">x</a>'))).toBe('info-uk@acme.com');
});

test('refuses a named person, a no-reply, and an ops alias', () => {
  expect(pickContactEmail(doc('<a href="mailto:ada.lovelace@acme.com">Ada</a>'))).toBeUndefined();
  expect(pickContactEmail(doc('<a href="mailto:no-reply@acme.com">x</a>'))).toBeUndefined();
  expect(pickContactEmail(doc('<a href="mailto:webmaster@acme.com">x</a>'))).toBeUndefined();
  expect(pickContactEmail(doc('<a href="mailto:abuse@acme.com">x</a>'))).toBeUndefined();
});

test('skips a malformed mailto rather than storing junk', () => {
  expect(pickContactEmail(doc('<a href="mailto:">x</a>'))).toBeUndefined();
  expect(pickContactEmail(doc('<a href="mailto:hello">x</a>'))).toBeUndefined();
  expect(pickContactEmail(doc('<a href="mailto:a@b@c">x</a>'))).toBeUndefined();
});

test('prefers the first generic address over a later one', () => {
  const html = '<a href="mailto:ada@acme.com">Ada</a><a href="mailto:hello@acme.com">Us</a>';
  expect(pickContactEmail(doc(html))).toBe('hello@acme.com');
});

/**
 * The address's own domain is deliberately ignored — plenty of companies route
 * `hello@` through a helpdesk on another host, and requiring a match would
 * discard exactly the addresses worth having.
 */
test('does not require the address to match the site domain', () => {
  expect(pickContactEmail(doc('<a href="mailto:hello@acmehelp.zendesk.com">x</a>'))).toBe(
    'hello@acmehelp.zendesk.com'
  );
});

const base = new URL('https://acme.com/');

test('nominates a same-origin contact page', () => {
  expect(pickContactUrl(doc('<a href="/contact">Contact</a>'), base)).toBe('https://acme.com/contact');
  expect(pickContactUrl(doc('<a href="/about-us/">About</a>'), base)).toBe(
    'https://acme.com/about-us/'
  );
});

test('strips the query and fragment from the nominated page', () => {
  expect(pickContactUrl(doc('<a href="/contact?ref=nav#form">C</a>'), base)).toBe(
    'https://acme.com/contact'
  );
});

test('never leaves the origin, and never nominates the page it is on', () => {
  expect(pickContactUrl(doc('<a href="https://elsewhere.com/contact">C</a>'), base)).toBeUndefined();
  expect(pickContactUrl(doc('<a href="/">Home</a>'), base)).toBeUndefined();
  expect(pickContactUrl(doc('<a href="/contact">C</a>'), new URL('https://acme.com/contact'))).toBeUndefined();
});

test('ignores a deep path that merely mentions contact', () => {
  // `/blog/how-to-contact-us` is an article, not the contact page.
  expect(pickContactUrl(doc('<a href="/blog/how-to-contact-us">Post</a>'), base)).toBeUndefined();
});

/**
 * The gap these cover was found on the live site: a company had no way to
 * record an email, a phone number or its own website. `email` and `phone` were
 * added to the schema for outreach but never to the handler that writes them,
 * and `url` had never been editable at all.
 */
import { beforeAll } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

let ctx: TestDb;
let alice: Tenant;
let acme: string;

function patch(tenant: Tenant, id: string, body: unknown) {
  return {
    request: new Request(`http://localhost/api/companies/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }),
    params: { id },
    locals: { user: tenant.user, sessionId: null }
  } as never;
}

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
  const { saveCompany } = await import('../src/lib/server/saveCompany');
  acme = (await saveCompany(alice.scope, null, { name: 'Acme Corp' })).id;
});

test('a company accepts an email and a phone number', async () => {
  const { PATCH } = await import('../src/routes/api/companies/[id]/+server');
  const res = await PATCH(patch(alice, acme, { email: 'hello@acme.com', phone: '+31 20 000 0000' }));
  expect(res.status).toBe(200);
  const row = (await res.json()) as { email: string; phone: string };
  expect(row.email).toBe('hello@acme.com');
  expect(row.phone).toBe('+31 20 000 0000');
});

/**
 * `url` is the workspace's dedupe key, so the handler normalises it through the
 * same `cleanUrl` a browser capture uses — otherwise two spellings of the same
 * site stop being one record — and carries `domain` along, since that is what
 * the logo is derived from.
 */
test('setting a website normalises it and moves the domain with it', async () => {
  const { PATCH } = await import('../src/routes/api/companies/[id]/+server');
  const res = await PATCH(patch(alice, acme, { url: 'HTTP://WWW.Acme.com/?utm_source=x' }));
  const row = (await res.json()) as { url: string; domain: string };
  expect(row.url).toBe('http://www.acme.com/');
  expect(row.domain).toBe('acme.com');
});

test('clearing the website clears the domain too', async () => {
  const { PATCH } = await import('../src/routes/api/companies/[id]/+server');
  const row = (await (await PATCH(patch(alice, acme, { url: '' }))).json()) as {
    url: null;
    domain: null;
  };
  expect(row.url).toBeNull();
  expect(row.domain).toBeNull();
});

test('an unusable website is a 400, not a 500', async () => {
  const { PATCH } = await import('../src/routes/api/companies/[id]/+server');
  await expect(PATCH(patch(alice, acme, { url: 'not a url' }))).rejects.toMatchObject({
    status: 400
  });
});

/**
 * Two companies cannot share a site — that is `uq_companies_ws_url`, and it is
 * what makes a later capture deduplicate. Reported as a 409 the user can act
 * on rather than an unhandled constraint error.
 */
test('taking another company’s website is a 409', async () => {
  const { PATCH } = await import('../src/routes/api/companies/[id]/+server');
  const { saveCompany } = await import('../src/lib/server/saveCompany');
  const beta = (await saveCompany(alice.scope, 'https://beta.example/')).id;

  await PATCH(patch(alice, acme, { url: 'https://taken.example' }));
  await expect(PATCH(patch(alice, beta, { url: 'https://taken.example' }))).rejects.toMatchObject({
    status: 409
  });
});
