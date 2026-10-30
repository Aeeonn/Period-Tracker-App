import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';

let vite: ViteDevServer | undefined;
let origin = '';
const pageErrors = new WeakMap<Page, string[]>();

async function openFixture(page: Page, query = ''): Promise<void> {
  await page.goto(`${origin}/tests/e2e/today-fixtures/${query}`);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

async function dismissToast(page: Page): Promise<void> {
  const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
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
    throw new Error('Today fixture server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

test('T-UX-01 @today period start takes one tap and flow, symptom, and mood take two', async ({
  page,
}) => {
  await openFixture(page);
  await page.getByRole('button', { name: 'Period started', exact: true }).click();
  await expect(page.locator('.ui-toast')).toContainText('Saved: Period started.');
  await expect(page.getByRole('heading', { name: 'Still bleeding today?' })).toBeVisible();
  await expect(page.getByText('Cycle day 1')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Cycle day 12')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Still bleeding today?' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Log today', exact: true }).click();
  await page
    .getByRole('group', { name: 'Flow level' })
    .getByRole('button', { name: 'Medium' })
    .click();
  await expect(page.locator('.ui-toast')).toContainText('Saved: Flow: Medium.');
  await dismissToast(page);

  await page.getByRole('button', { name: 'Log today', exact: true }).click();
  await page
    .getByRole('group', { name: 'Symptoms' })
    .getByRole('button', { name: 'Cramps' })
    .click();
  await expect(page.locator('.ui-toast')).toContainText('Saved: Symptom: Cramps.');
  await dismissToast(page);

  await page.getByRole('button', { name: 'Log today', exact: true }).click();
  await page
    .getByRole('group', { name: 'Mood' })
    .getByRole('button', { name: 'Low', exact: true })
    .click();
  await expect(page.locator('.ui-toast')).toContainText('Saved: Mood: Low.');
});

test('T-UX-02 @today every prediction surface has a window and a Why sheet', async ({ page }) => {
  await openFixture(page);
  await expect(page.getByText('Next period: around Nov 8')).toBeVisible();
  await expect(page.getByText('Expected window: Nov 6 – Nov 10')).toBeVisible();

  const whyButtons = page.getByRole('button', { name: 'Why?', exact: true });
  await expect(whyButtons).toHaveCount(2);
  await whyButtons.nth(0).click();
  const predictionWhy = page.getByRole('dialog', { name: 'Why?' });
  await expect(predictionWhy).toContainText('planning range');
  await predictionWhy.getByRole('button', { name: 'Close' }).click();

  await whyButtons.nth(1).click();
  const chanceWhy = page.getByRole('dialog', { name: 'Why?' });
  await expect(chanceWhy).toContainText('This category is an uncertain estimate.');
});

test('T-UX-02 @today suppressed output still explains the paused prediction', async ({ page }) => {
  await openFixture(page, '?suppression=no_data');
  await expect(page.getByText('Log your period to start predictions.')).toBeVisible();
  const whyButtons = page.getByRole('button', { name: 'Why?', exact: true });
  await expect(whyButtons).toHaveCount(2);
  await whyButtons.first().click();
  await expect(page.getByRole('dialog', { name: 'Why?' })).toContainText(
    'Log your period to start predictions.',
  );
});

test('T-UX-04 @today keeps uncertainty and no-safe-days copy for every A5 suppression category', async ({
  page,
}) => {
  const cases = [
    ['', 'Medium'],
    ['pregnant', 'Not shown in pregnancy mode'],
    ['postpartum_before_first_period', 'Possible before a first period'],
    ['hormonal', 'Depends on method'],
    ['late', 'Unknown'],
    ['cycle_length', 'Not estimated'],
    ['no_data', 'Not enough data yet'],
  ] as const;

  for (const [reason, chanceLabel] of cases) {
    await openFixture(page, `?suppression=${reason}`);
    const body = await page.locator('body').innerText();
    expect(body).toContain(chanceLabel);
    expect(body).toContain('No day is "safe" without contraception.');
    expect(body).toContain('Pregnancy is possible any day.');
    expect(body).not.toMatch(/\b(?:zero chance|no chance)\b/iu);
    expect(body).not.toMatch(/\b(?:safe days? for sex|risk-free)\b/iu);
  }
});

test('T-UX-04 @today an EMERGENCY warning fixture cannot be dismissed while active', async ({
  page,
}) => {
  await openFixture(page, '?fixture=emergency');
  const warning = page.getByTestId('today-warning-W-01');
  const dismiss = page.getByTestId('today-warning-dismiss-W-01');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Emergency');
  await expect(dismiss).toBeDisabled();
  await dismiss.evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(warning).toBeVisible();
});

test('Today @today is registered in the existing owner app shell', async ({ page }) => {
  await page.goto(`${origin}/`);
  await expect(page.getByRole('navigation', { name: 'Cycle owner navigation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('Next period: around Nov 8')).toBeVisible();
  await expect(
    page.getByText('A reviewed education card will appear here when available.'),
  ).toBeVisible();
});
