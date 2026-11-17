import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';
import { fillConfirmation, configureThroughUi, setupOrUnlockApp } from './helpers/lock.ts';

let vite: ViteDevServer | undefined;
let origin = '';
const pageErrors = new WeakMap<Page, string[]>();

async function checkA11yInBothThemes(page: Page): Promise<void> {
  try {
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const serious = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(serious, `${theme} theme accessibility violations`).toEqual([]);
    }
  } finally {
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  }
}

async function openIntro(page: Page, query = ''): Promise<void> {
  await page.goto(`${origin}/${query}`);
  await expect(
    page.getByRole('heading', { name: 'Welcome to your cycle companion' }),
  ).toBeVisible();
}

// Setup no longer asks for a role: it is the owner unless the URL says `?role=partner`.
async function continuePastInstall(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const installTitle = page.getByRole('heading', { name: 'Make room for the app' });
  await expect(installTitle).toBeVisible();
  await expect(
    page.getByText('Data entered in Safari is not carried into the installed app.'),
  ).toBeVisible();
  await checkA11yInBothThemes(page);
  await page.getByRole('button', { name: 'Continue in browser anyway' }).click();
  await expect(page.getByRole('heading', { name: 'Which brings you here?' })).toHaveCount(0);
}

async function configureLock(page: Page): Promise<void> {
  const { code, positions } = await configureThroughUi(page);
  await fillConfirmation(page, code, positions);
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
    throw new Error('Onboarding fixture server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

test('T-A11Y-01 @onboarding fresh owner setup stores basics and returning owner skips onboarding', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openIntro(page);
  await checkA11yInBothThemes(page);
  await continuePastInstall(page);
  await configureLock(page);

  await expect(page.getByRole('heading', { name: 'Your basics' })).toBeVisible({ timeout: 15_000 });
  await checkA11yInBothThemes(page);
  await expect(page.getByLabel('Typical cycle length (days)')).toHaveValue('');
  await expect(page.getByLabel('Avoid pregnancy')).toBeVisible();
  await expect(page.getByLabel('Trying to conceive')).toHaveCount(0);
  await expect(page.getByLabel('Typical period length (days)')).toHaveValue('');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Gentle reminders' })).toBeVisible();
  await checkA11yInBothThemes(page);
  await expect(page.getByLabel('Remind me to log my period while I’m on it')).toBeChecked();
  await expect(page.getByLabel('Daily check-in')).not.toBeChecked();
  // Reminders is the last step: the owner removed the server-disclosure step (2026-11-16).
  await expect(page.getByLabel('Step 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Who runs the app/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('heading', { name: 'No cycle logs yet' })).toBeVisible();
  await expect(page.getByText('Log your period to start predictions.')).toBeVisible();

  await page.reload();
  await setupOrUnlockApp(page);
  await expect(page.getByRole('heading', { name: 'Your basics' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Gentle reminders' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});

test('@onboarding partner setup ends on a short ready step with sharing off', async ({ page }) => {
  await openIntro(page, '?role=partner');
  await continuePastInstall(page);
  await configureLock(page);

  await expect(page.getByRole('heading', { name: 'You’re ready' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Sharing is off until she turns categories on.')).toBeVisible();
  await checkA11yInBothThemes(page);
  await page.getByRole('button', { name: 'Continue to Today', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Partner navigation' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});

test('@onboarding ?today=synthetic bypasses onboarding and keeps the preview', async ({ page }) => {
  await page.goto(`${origin}/?today=synthetic`);
  await expect(page.getByRole('heading', { name: 'Create your lock' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome to your cycle companion' })).toHaveCount(
    0,
  );
  await configureLock(page);
  await expect(page.getByRole('note')).toContainText('Preview — synthetic data only', {
    timeout: 15_000,
  });
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});
