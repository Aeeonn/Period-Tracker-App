import { expect, test } from '@playwright/test';

test('set up, log a period, and keep it after reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /add Flo to your Home Screen/ })).toBeVisible();
  await page.getByRole('button', { name: 'Set up my tracker' }).click();
  await page.getByLabel('Usual cycle length (days)').fill('29');
  await page.getByLabel('Birth control').selectOption('hormonal_iud');
  await page.getByRole('button', { name: 'Start' }).click();

  await page.getByRole('button', { name: 'Log today' }).click();
  await page.getByRole('button', { name: 'Heavy', exact: true }).click();
  await page.getByRole('switch', { name: /Soaking/ }).check();
  await page.getByRole('button', { name: /^Body/ }).click();
  await page.getByRole('button', { name: 'Dizzy or faint' }).click();
  await page.getByRole('button', { name: /^Habits/ }).click();
  await page.getByRole('button', { name: 'More water' }).click();
  await page.getByRole('button', { name: 'More water' }).click();
  await expect(page.getByText('2 glasses')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByRole('heading', { name: 'Get emergency care now' })).toBeVisible();
  await expect(page.getByText('Day 1', { exact: true })).toBeVisible();
  // Hormonal IUD: no fertile window and no prediction from a single period.
  await expect(page.getByRole('heading', { name: /Fertile window/ })).toHaveCount(0);
  await expect(page.getByText(/Predictions start after three logged periods/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Edit today' })).toBeVisible();
  await page.getByRole('link', { name: 'Calendar' }).click();
  await expect(page.locator('.calendar__day.is-today.is-period')).toHaveCount(1);
  await page.getByRole('link', { name: 'Patterns' }).click();
  await expect(page.getByRole('heading', { name: 'Nothing to show yet' })).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Reminders' })).toBeVisible();
  await expect(page.getByText(/Home Screen/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByRole('button', { name: 'Set up my tracker' })).toBeVisible();
});
