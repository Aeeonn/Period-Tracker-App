import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';

let vite: ViteDevServer | undefined;
let origin = '';
const pageErrors = new WeakMap<Page, string[]>();
const TRACKER_LABELS = [
  'Flow',
  'Period pain',
  'Discharge',
  'Symptoms',
  'Mood',
  'Energy',
  'Stress',
  'Desire',
  'Sex and intimacy',
  'Tests and emergency contraception',
  'Basal body temperature',
  'Ovulation',
  'Pill intake',
  'Medication',
  'Weight',
  'Water',
  'Sleep',
  'Activity',
  'Alcohol',
  'Notes',
  'Perimenopause impacts',
  'Postpartum bleeding',
] as const;
const NOTE_PAYLOAD =
  '<script>window.logPayloadRan = true</script><img src=x onerror="window.logPayloadRan=true">';

async function openFixture(page: Page, query = ''): Promise<void> {
  await page.goto(`${origin}/tests/e2e/log-fixtures/${query}`);
  await expect(page.getByRole('heading', { name: 'Log', exact: true })).toBeVisible();
}

async function selectTracker(page: Page, label: string): Promise<void> {
  const pinned = page.getByRole('group', { name: 'Pinned trackers' });
  if (
    await pinned
      .getByRole('button', { name: label, exact: true })
      .isVisible()
      .catch(() => false)
  ) {
    await pinned.getByRole('button', { name: label, exact: true }).click();
    return;
  }
  await page.getByRole('button', { name: 'Customize trackers' }).click();
  await page.getByRole('button', { name: `Pin ${label}`, exact: true }).click();
  const done = page.getByRole('button', { name: 'Done', exact: true });
  await done.scrollIntoViewIfNeeded();
  await done.click();
  await pinned.getByRole('button', { name: label, exact: true }).click();
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
  if (!address || typeof address === 'string') throw new Error('Log fixture server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

for (const label of TRACKER_LABELS) {
  test(`T-A11Y-01 @log @a11y audits ${label} in light and dark themes`, async ({ page }) => {
    test.setTimeout(60_000);
    await openFixture(page);
    await selectTracker(page, label);

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const builder = new AxeBuilder({ page });
      if (label !== 'Desire') builder.include('.log-screen__form-card');
      const results = await builder.analyze();
      expect(
        results.violations.filter(
          (violation) => violation.impact === 'serious' || violation.impact === 'critical',
        ),
        `${theme} theme, ${label}`,
      ).toEqual([]);
    }
  });
}

test('T-UX-03 @log heavy and very-heavy flow reveal heavy details', async ({ page }) => {
  await openFixture(page, '?fixture=heavy');
  await page.getByRole('button', { name: 'Flow', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Heavy-flow details' })).toBeVisible();

  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Heavy-flow details' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Very heavy', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Heavy-flow details' })).toBeVisible();
});

test('T-UX-01 @log Fahrenheit BBT input saves in canonical Celsius', async ({ page }) => {
  await page.clock.install({ time: new Date('2032-04-05T12:00:00') });
  await openFixture(page, '?fixture=day-log&unit=fahrenheit');
  await expect(page.getByLabel('Log date')).toHaveValue('2032-04-05');
  await selectTracker(page, 'Basal body temperature');

  const bbt = page.getByRole('region', { name: 'Basal body temperature', exact: true });
  await expect(bbt).toBeVisible();
  const temperature = bbt.getByRole('spinbutton', { name: /^Temperature/ });
  await expect(temperature).toHaveCount(1);
  await expect(bbt.locator('.log-input__with-unit')).toContainText('°F');
  await expect(temperature).toHaveAttribute('min', '95');
  await expect(temperature).toHaveAttribute('max', '107.6');
  await temperature.fill('107.7');
  await expect(
    bbt.getByText('Enter a temperature between 35 and 42 °C (95 to 107.6 °F).'),
  ).toBeVisible();
  const saveButton = bbt.getByRole('button', { name: 'Save Basal body temperature' });
  await expect(saveButton).toBeDisabled();

  await temperature.fill('98.6');
  await bbt.getByLabel('Measured at', { exact: true }).fill('07:00');
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.getByText('Saved privately.', { exact: true })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const testWindow = window as Window & {
      __logTest?: {
        readDay: (localDate: string) => Promise<{ bbt?: { valueC: number } } | undefined>;
      };
    };
    return testWindow.__logTest?.readDay('2032-04-05');
  });
  expect(saved?.bbt?.valueC).toBeCloseTo(37, 2);
});

test('T-UX-03 @log trackers can be pinned, hidden, and reordered', async ({ page }) => {
  await openFixture(page);
  const pinned = page.getByRole('group', { name: 'Pinned trackers' });
  await page.getByRole('button', { name: 'Customize trackers' }).click();
  await page.getByRole('button', { name: 'Move Flow down' }).click();
  await expect(pinned.getByRole('button').nth(0)).toHaveText('Symptoms');
  await expect(pinned.getByRole('button').nth(1)).toHaveText('Flow');

  await page.getByRole('button', { name: 'Hide Flow', exact: true }).click();
  await expect(pinned.getByRole('button', { name: 'Flow', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pin Weight', exact: true }).click();
  await expect(pinned.getByRole('button', { name: 'Weight', exact: true })).toBeVisible();
});

test('T-SEC-06 @log note payloads remain literal text when shown again', async ({ page }) => {
  await openFixture(page, '?fixture=note');
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue(NOTE_PAYLOAD);
  await expect(page.locator('.log-screen img')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Boolean((window as Window & { logPayloadRan?: boolean }).logPayloadRan),
    ),
  ).toBe(false);
});

test('@log without a repository shows the gentle disabled save state', async ({ page }) => {
  await openFixture(page, '?fixture=locked');
  await expect(page.locator('.log-screen__locked')).toContainText('Unlock to save');
  await expect(page.getByRole('button', { name: 'Save Desire' })).toBeDisabled();
});
test('@log the AppShell Log tab opens the injected screen and retains tracker choices across tabs', async ({
  page,
}) => {
  await openFixture(page, '?fixture=app');
  await expect(page.locator('.log-screen__locked')).toHaveCount(0);
  await selectTracker(page, 'Desire');
  await page
    .getByRole('group', { name: 'Desire level' })
    .getByRole('button', { name: 'Medium', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save Desire', exact: true }).click();
  await expect(page.getByText('Saved privately.')).toBeVisible();
  await page.getByRole('button', { name: 'Customize trackers' }).click();
  await page.getByRole('button', { name: 'Hide Flow', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await page.getByRole('link', { name: 'Today' }).click();
  await page.getByRole('link', { name: 'Log' }).click();
  await expect(page.getByRole('heading', { name: 'Log', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: 'Pinned trackers' })
      .getByRole('button', { name: 'Flow', exact: true }),
  ).toHaveCount(0);
});
