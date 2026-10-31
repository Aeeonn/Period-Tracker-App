import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';

const syntheticPassphrase = 'synthetic harbor glimmer 74';
let vite: ViteDevServer | undefined;
let origin = '';
const pageErrors = new WeakMap<Page, string[]>();

async function configureApp(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Create your lock' })).toBeVisible();
  await page.getByLabel('Passphrase', { exact: true }).fill(syntheticPassphrase);
  await page.getByRole('button', { name: 'Create passphrase' }).click();
  const code = (await page.getByTestId('recovery-code').textContent())?.trim();
  if (!code) throw new Error('Synthetic recovery code was not rendered');
  const instructions = await page.locator('#lock-confirm-instructions').textContent();
  const positions = instructions?.match(/\d+/gu)?.map(Number) ?? [];
  if (positions.length !== 4) throw new Error('Recovery confirmation positions were not rendered');
  const canonical = code.replaceAll('-', '');
  for (const position of positions) {
    await page
      .getByLabel(`Character at position ${position}`, { exact: true })
      .fill(canonical[position - 1]!);
  }
  await page.getByRole('button', { name: 'Confirm recovery code' }).click();
  await expect(page.locator('.shell-root')).toBeVisible();
}

async function expectSettingsAccessible(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .include('.settings-screen')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);
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
    throw new Error('Settings test server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

test('Settings @settings keeps deletion cancellable and persists profile choices', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(`${origin}/?today=synthetic`);
  await configureApp(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delete all my data' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete all my data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete all my data?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete everything' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByTestId('temperature-preview')).toHaveText('20.0 \u00b0C');
  await expect(page.locator('.settings-screen')).toHaveCSS('animation-name', 'none');
  await expectSettingsAccessible(page);

  await page.getByLabel('Fahrenheit', { exact: true }).check();
  await expect(page.getByTestId('temperature-preview')).toHaveText('68.0 \u00b0F');
  await expect(page.getByRole('status')).toContainText('Settings saved on this device.');
  await page.getByLabel('Pounds (lb)', { exact: true }).check();
  await page.getByLabel('Start the week on').selectOption({ label: 'Sunday' });
  await page.getByLabel('Choose a color theme').selectOption({ label: 'Dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Lock after inactivity').selectOption({ label: '1 minute' });

  await page.getByRole('button', { name: 'Hide Flow' }).click();
  await page.getByRole('link', { name: 'Log', exact: true }).click();
  await expect(
    page.getByRole('group', { name: 'Pinned trackers' }).getByRole('button', { name: 'Flow' }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByLabel('Fahrenheit', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Pounds (lb)', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Start the week on')).toHaveValue('7');
  await expect(page.getByLabel('Choose a color theme')).toHaveValue('dark');
  await expect(page.getByLabel('Lock after inactivity')).toHaveValue('60');
  await expect(page.getByText('cycle-engine/1.0.0')).toBeVisible();

  await page.getByText('Sources for educational content').click();
  expect(await page.locator('.settings-sources a').count()).toBeGreaterThan(0);
  await expectSettingsAccessible(page);
});
