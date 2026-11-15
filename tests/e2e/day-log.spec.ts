import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';

let vite: ViteDevServer | undefined;
let origin = '';
const pageErrors = new WeakMap<Page, string[]>();
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function calendarDateLabel(localDate: string): string {
  const month = Number(localDate.slice(5, 7));
  const day = Number(localDate.slice(8, 10));
  return `${MONTHS[month - 1]} ${day}, ${localDate.slice(0, 4)}`;
}

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test.beforeAll(async () => {
  vite = await createServer({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string')
    throw new Error('Day log fixture server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

test('@day-log saves each tap at once and shows the saved entries in Calendar', async ({ page }) => {
  await page.goto(`${origin}/tests/e2e/log-fixtures/?fixture=day-log`);
  await expect(page.getByRole('heading', { name: 'Log', exact: true })).toBeVisible();
  const dateInput = page.getByLabel('Log date');
  const savedDate = await dateInput.inputValue();
  const pinned = page.getByRole('group', { name: 'Pinned trackers' });

  // Chip-only trackers save on tap: no Save button and no unsaved marker.
  await pinned.getByRole('button', { name: 'Flow', exact: true }).click();
  await page
    .getByRole('group', { name: 'Flow level' })
    .getByRole('button', { name: 'Medium', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Saved privately.');
  await expect(page.getByText('Flow: Medium', { exact: true })).toBeVisible();
  await pinned.getByRole('button', { name: 'Mood', exact: true }).click();
  await page
    .getByRole('group', { name: 'Mood' })
    .getByRole('button', { name: 'Calm', exact: true })
    .click();
  await expect(page.getByText('Mood: Calm', { exact: true })).toBeVisible();
  await expect(page.locator('.log-tracker-list__unsaved-dot')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0);

  const otherDate = savedDate === '2032-04-04' ? '2032-04-05' : '2032-04-04';

  // Typed trackers keep an explicit save, and guard unsaved text on a date change.
  await pinned.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByLabel('Note', { exact: true }).fill('synthetic draft note');
  await expect(
    pinned
      .getByRole('button', { name: 'Notes', exact: true })
      .locator('.log-tracker-list__unsaved-dot'),
  ).toBeVisible();
  await dateInput.fill(otherDate);
  await expect(page.locator('.log-screen__date-confirmation')).toContainText('unsaved edits');
  await page.getByRole('button', { name: 'Stay on this day', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Notes: synthetic draft note', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0);

  // The day stepper moves one calendar day at a time.
  await dateInput.fill(otherDate);
  await expect(dateInput).toHaveValue(otherDate);
  await expect(page.getByText('Nothing logged yet', { exact: true })).toBeVisible();
  await dateInput.fill(savedDate);
  await expect(page.getByText('Flow: Medium', { exact: true })).toBeVisible();
  await expect(page.getByText('Mood: Calm', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(dateInput).not.toHaveValue(savedDate);
  await page.getByRole('button', { name: 'Previous day', exact: true }).click();
  await expect(dateInput).toHaveValue(savedDate);

  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  const dateLabel = calendarDateLabel(savedDate);
  await page.getByRole('button', { name: new RegExp(`^${dateLabel}.*log present`) }).click();
  const loggedEntries = page.getByLabel('Logged entries');
  await expect(loggedEntries.getByText('Flow: Medium')).toBeVisible();
  await expect(loggedEntries.getByText('Mood: Calm')).toBeVisible();
  await page.getByRole('button', { name: 'Edit this day', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Log', exact: true })).toBeVisible();
  await expect(page.getByLabel('Log date')).toHaveValue(savedDate);
});
