import { test, expect, rowBoxes, bulkBar, revealOpacity, visit } from './fixtures';

/**
 * The bug this file exists for: clicking a row's checkbox updated the selection
 * — the count said "1 person selected" — while the box you clicked rendered
 * empty. `preventDefault()` on a checkbox click makes the browser run its
 * canceled activation steps, restoring `input.checked` after every handler has
 * run, on top of what Svelte just set.
 *
 * So every assertion below reads the DOM's `checked` state, not just the count.
 * Asserting only the count is exactly what would have missed it.
 */

test('a clicked row reports selected AND renders selected', async ({ app }) => {
  await visit(app, '/people');
  const boxes = rowBoxes(app);
  await expect(boxes).toHaveCount(6);

  await boxes.nth(0).click();

  await expect(bulkBar(app)).toContainText('1 person selected');
  await expect(boxes.nth(0)).toBeChecked();
  await expect(boxes.nth(1)).not.toBeChecked();
});

test('shift-click extends the range', async ({ app }) => {
  await visit(app, '/people');
  const boxes = rowBoxes(app);

  await boxes.nth(0).click();
  // Wait for the first click to be reflected before the second. A person sees
  // "1 selected" before they shift-click; firing both into the same frame races
  // the render and makes the spec flaky rather than testing anything.
  await expect(bulkBar(app)).toContainText('1 person selected');
  await boxes.nth(3).click({ modifiers: ['Shift'] });

  await expect(bulkBar(app)).toContainText('4 people selected');
  for (const i of [0, 1, 2, 3]) await expect(boxes.nth(i)).toBeChecked();
  for (const i of [4, 5]) await expect(boxes.nth(i)).not.toBeChecked();
});

test('clicking a selected row deselects it', async ({ app }) => {
  await visit(app, '/people');
  const boxes = rowBoxes(app);

  await boxes.nth(0).click();
  await expect(bulkBar(app)).toContainText('1 person selected');
  await boxes.nth(1).click();
  await expect(bulkBar(app)).toContainText('2 people selected');

  await boxes.nth(0).click();
  await expect(bulkBar(app)).toContainText('1 person selected');
  await expect(boxes.nth(0)).not.toBeChecked();
  await expect(boxes.nth(1)).toBeChecked();
});

test('select-all ticks every loaded row, and toggles back off', async ({ app }) => {
  await visit(app, '/people');
  const boxes = rowBoxes(app);
  const all = app.getByLabel('Select all loaded rows');

  await all.click();
  await expect(bulkBar(app)).toContainText('6 people selected');
  for (let i = 0; i < 6; i++) await expect(boxes.nth(i)).toBeChecked();

  await app.getByLabel('Deselect all loaded rows').click();
  await expect(bulkBar(app)).toHaveCount(0);
  for (let i = 0; i < 6; i++) await expect(boxes.nth(i)).not.toBeChecked();
});

/**
 * `layerStack` owns Escape for overlays and the command registry is a separate
 * window listener, so an unguarded binding closed the popover *and* threw away
 * the selection under it. `layerDepth() === 0` is what stops that.
 */
test('Escape closes an open popover before it clears the selection', async ({ app }) => {
  await visit(app, '/people');
  await rowBoxes(app).nth(0).click();
  await bulkBar(app).getByRole('button', { name: 'Priority' }).click();
  await expect(app.getByRole('menuitem', { name: 'High' })).toBeVisible();

  await app.keyboard.press('Escape');
  await expect(app.getByRole('menuitem', { name: 'High' })).toHaveCount(0);
  await expect(bulkBar(app)).toContainText('1 person selected');

  await app.keyboard.press('Escape');
  await expect(bulkBar(app)).toHaveCount(0);
});

test('the select-all box stays hidden until hover or a selection', async ({ app }) => {
  await visit(app, '/people');
  // Present for assistive tech, but not painted on an untouched table.
  await expect(app.getByLabel('Select all loaded rows')).toHaveCount(1);
  expect(await revealOpacity(app, 'Select all loaded rows')).toBe('0');

  await rowBoxes(app).nth(0).click();
  await expect(bulkBar(app)).toContainText('1 person selected');
  expect(await revealOpacity(app, 'Select all loaded rows')).toBe('1');
});

test('a bulk priority change applies to every selected row', async ({ app }) => {
  await visit(app, '/people');
  const boxes = rowBoxes(app);
  await boxes.nth(0).click();
  await expect(bulkBar(app)).toContainText('1 person selected');
  await boxes.nth(2).click({ modifiers: ['Shift'] });
  await expect(bulkBar(app)).toContainText('3 people selected');

  await bulkBar(app).getByRole('button', { name: 'Priority' }).click();
  await app.getByRole('menuitem', { name: 'Medium' }).click();

  await expect(app.getByText('Updated 3 people')).toBeVisible();
  // Optimistic: the selection survives, because nothing reloaded.
  await expect(bulkBar(app)).toContainText('3 people selected');
});

test('companies behave the same way', async ({ app }) => {
  await visit(app, '/companies');
  const boxes = rowBoxes(app);
  await expect(boxes).toHaveCount(3);

  await boxes.nth(0).click();
  await expect(boxes.nth(0)).toBeChecked();
  // Plural, not "companys".
  await expect(bulkBar(app)).toContainText('1 company selected');

  await app.getByLabel('Select all loaded rows').click();
  await expect(bulkBar(app)).toContainText('3 companies selected');
});

/**
 * The template list is fetched with `?target=`, which is the one thing keeping
 * a company template out of a person's composer.
 */
test('outreach offers only templates for the page it is on', async ({ app }) => {
  await visit(app, '/people');
  await rowBoxes(app).nth(0).click();
  await bulkBar(app).getByRole('button', { name: 'Outreach' }).click();
  await expect(app.getByRole('link', { name: 'Person intro' })).toBeVisible();
  await expect(app.getByRole('link', { name: 'Company intro' })).toHaveCount(0);

  await visit(app, '/companies');
  await rowBoxes(app).nth(0).click();
  await bulkBar(app).getByRole('button', { name: 'Outreach' }).click();
  await expect(app.getByRole('link', { name: 'Company intro' })).toBeVisible();
  await expect(app.getByRole('link', { name: 'Person intro' })).toHaveCount(0);
});
