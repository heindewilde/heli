import { test, expect, visit } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Reported from the live site: a company had nowhere to record an email
 * address, and nowhere to record its own website. `email` and `phone` reached
 * the schema for company outreach but never the handler that writes them, and
 * `url` had never been editable at all — so a company added by hand could never
 * be given the one field its outreach template needs.
 *
 * `Editable` renders a button carrying the field's label in display mode and an
 * input carrying the same label while editing, which is what these drive.
 */
async function setField(app: Page, label: string, value: string) {
  await app.getByRole('button', { name: label, exact: true }).click();
  const input = app.getByRole('textbox', { name: label, exact: true });
  await input.fill(value);
  await input.press('Enter');
}

test('a company can be given a website, an email and a phone number', async ({ app }) => {
  await visit(app, '/companies');
  await app.getByRole('link', { name: 'Acme Corp' }).first().click();
  await expect(app.getByRole('button', { name: 'Name', exact: true })).toContainText('Acme Corp');

  // The rows exist at all — this is the reported gap, next to LinkedIn and X.
  for (const label of ['Website', 'Email', 'Phone', 'Industry', 'Location', 'LinkedIn', 'X']) {
    await expect(app.getByText(label, { exact: true })).toBeVisible();
  }

  await setField(app, 'Email', 'hello@acme.com');
  await expect(app.getByRole('button', { name: 'Email', exact: true })).toContainText(
    'hello@acme.com'
  );

  await setField(app, 'Phone', '+31 20 000 0000');
  await expect(app.getByRole('button', { name: 'Phone', exact: true })).toContainText(
    '+31 20 000 0000'
  );

  // Normalised on the way in, because `url` is the workspace's dedupe key and
  // has to match what a browser capture of the same site would store.
  await setField(app, 'Website', 'ACME.example/');
  await expect(app.getByRole('button', { name: 'Website', exact: true })).toContainText(
    'https://acme.example'
  );

  // And it survives a reload, i.e. it was written rather than held optimistically.
  await app.reload();
  await expect(app.getByRole('button', { name: 'Email', exact: true })).toContainText(
    'hello@acme.com'
  );
  await expect(app.getByRole('button', { name: 'Website', exact: true })).toContainText(
    'https://acme.example'
  );
});
