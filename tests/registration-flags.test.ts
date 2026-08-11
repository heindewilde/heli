import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';

/**
 * The two registration flags, and the bootstrap escape hatch between them.
 *
 * This is exactly the class of invariant that survives in prose and dies in
 * code: README, SELFHOST and CLAUDE.md all promised "the first account can
 * always be created", the function's own comment said so, and the
 * implementation returned early on DISABLE_REGISTRATION before ever checking.
 * An operator who set the kill switch in .env before first boot was locked out
 * of their own fresh install with no way back in from the app.
 */

let ctx: TestDb;

beforeAll(async () => {
  ctx = await freshDb();
}, 60_000);

afterEach(() => {
  delete process.env.DISABLE_REGISTRATION;
  delete process.env.ENABLE_REGISTRATION;
});

afterAll(() => ctx?.cleanup());

async function disabled(inviteToken?: string | null): Promise<boolean> {
  const { isRegistrationDisabled } = await import('../src/lib/server/auth');
  return isRegistrationDisabled(inviteToken);
}

test('isFirstUser asks the global registry, not the default region', async () => {
  // The regression this guards: userCount() counted `users` in the *default*
  // region, which on a multi-region deployment is a local file that never
  // receives a row — the real accounts live in EU/US/APAC. It answered "brand
  // new install" forever, so every flag downstream silently stopped working in
  // the cloud while behaving correctly on self-host.
  const { isFirstUser } = await import('../src/lib/server/auth');
  const { primaryDb } = await import('../src/lib/server/db');
  const { emailRouting } = await import('../src/lib/server/schema');

  expect(await isFirstUser()).toBe(true);
  // A routing row is what `register()` writes for every account in any region.
  await primaryDb().insert(emailRouting).values({ email: 'elsewhere@example.com', region: 'us' });
  expect(await isFirstUser()).toBe(false);
  await primaryDb().delete(emailRouting);
  expect(await isFirstUser()).toBe(true);
});

test('an empty install can always bootstrap, even with the kill switch set', async () => {
  process.env.DISABLE_REGISTRATION = '1';
  expect(await disabled()).toBe(false);
});

test('an empty install can bootstrap with no flags at all', async () => {
  expect(await disabled()).toBe(false);
});

test('once an account exists, sign-ups close by default', async () => {
  const { register } = await import('../src/lib/server/auth');
  await register({ email: 'first@example.com', password: 'correct-horse-1', username: 'first' });
  expect(await disabled()).toBe(true);
});

test('ENABLE_REGISTRATION reopens them', async () => {
  process.env.ENABLE_REGISTRATION = '1';
  expect(await disabled()).toBe(false);
});

test('DISABLE_REGISTRATION still wins over ENABLE_REGISTRATION', async () => {
  process.env.ENABLE_REGISTRATION = '1';
  process.env.DISABLE_REGISTRATION = '1';
  expect(await disabled()).toBe(true);
});

test('a live invite admits its addressee while public sign-up is closed', async () => {
  const { createInvite } = await import('../src/lib/server/invites');
  const { login } = await import('../src/lib/server/auth');

  const { user } = await login({ email: 'first@example.com', password: 'correct-horse-1' });
  const { invite } = await createInvite(
    user.region,
    user.workspaceId,
    user.id,
    'https://example.com',
    { email: 'colleague@example.com', role: 'member' }
  );

  expect(await disabled()).toBe(true);
  expect(await disabled(invite.token)).toBe(false);

  // ...and the kill switch beats even a live invite.
  process.env.DISABLE_REGISTRATION = '1';
  expect(await disabled(invite.token)).toBe(true);
});
