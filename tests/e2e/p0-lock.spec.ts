import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';

const syntheticPassphrase = 'synthetic harbor glimmer 74';
let vite: ViteDevServer | undefined;
let origin = '';
const pageErrors = new WeakMap<Page, string[]>();

async function configureApp(page: Page): Promise<void> {
  const passphrase = page.getByLabel('Passphrase', { exact: true });
  const describedBy = await passphrase.getAttribute('aria-describedby');
  expect(describedBy).toBe('lock-setup-passphrase-hint');
  await expect(page.locator(`#${describedBy}`)).toContainText('at least 10 characters');
  await passphrase.fill(syntheticPassphrase);
  await page.getByRole('button', { name: 'Create passphrase' }).click();

  await expect(page.locator('.lock-screen__warning')).toContainText('60 seconds');
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
  if (!address || typeof address === 'string') throw new Error('App lock server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

test('T-SEC-02 @lock cold start and hidden timeout keep rendered preview records behind the lock', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(origin);
  await expect(page.getByRole('heading', { name: 'Create your lock' })).toBeVisible();
  await expect(page.locator('.today-logged-summary')).toHaveCount(0);
  await configureApp(page);

  const previewRecord = page.locator('.today-logged-summary');
  await expect(previewRecord).toContainText('Energy');
  await expect(previewRecord).toContainText('Cramps');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(60_000);

  await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
  await expect(page.locator('.shell-root')).toHaveCount(0);
  const lockedText = await page.locator('body').innerText();
  expect(lockedText).not.toContain('Energy');
  expect(lockedText).not.toContain('Cramps');
  expect(lockedText).not.toContain('Cycle day 12');
});
