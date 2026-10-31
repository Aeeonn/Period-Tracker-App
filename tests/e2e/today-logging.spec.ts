import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';

let vite: ViteDevServer | undefined;
let origin = '';

async function openTodayFixture(page: Page): Promise<void> {
  await page.goto(`${origin}/tests/e2e/today-fixtures/`);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

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

test('@today-logging persists one period entry and lets the user remove it', async ({ page }) => {
  await openTodayFixture(page);
  const periodButton = page.getByRole('button', { name: 'Period started', exact: true });
  await periodButton.click();

  const selectedPeriodButton = page.getByRole('button', { name: 'Period started ✓', exact: true });
  await expect(selectedPeriodButton).toHaveAttribute('aria-pressed', 'true');
  await selectedPeriodButton.click();

  const summary = page.locator('.today-logged-summary');
  await expect(summary).toContainText('Flow: Medium');
  await expect
    .poll(async () => (await summary.innerText()).match(/Flow: Medium/gu)?.length ?? 0)
    .toBe(1);
  const savedDay = await page.evaluate(async () => {
    const testWindow = window as Window & {
      __quickLogTest?: { readDay: () => Promise<{ flow?: string } | undefined> };
    };
    return testWindow.__quickLogTest?.readDay();
  });
  expect(savedDay?.flow).toBe('medium');

  await page.getByRole('button', { name: 'Log today', exact: true }).click();
  const quickLog = page.getByRole('dialog', { name: 'Quick log' });
  await quickLog
    .getByRole('group', { name: 'Pinned quick-log trackers' })
    .getByRole('button', { name: 'Flow', exact: true })
    .click();
  await expect(
    quickLog
      .getByRole('group', { name: 'Flow level' })
      .getByRole('button', { name: 'Medium', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await quickLog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: "Remove today's period entry" }).click();
  await expect(summary).not.toContainText('Flow: Medium');
  await expect(periodButton).toHaveAttribute('aria-pressed', 'false');
  const clearedDay = await page.evaluate(async () => {
    const testWindow = window as Window & {
      __quickLogTest?: { readDay: () => Promise<{ flow?: string } | undefined> };
    };
    return testWindow.__quickLogTest?.readDay();
  });
  expect(clearedDay?.flow).toBeUndefined();
});
