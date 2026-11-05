import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import type { LogicalRecord } from '../../src/contracts/store.ts';
import { configureThroughUi, fillConfirmation } from './helpers/lock.ts';

const synthetic = JSON.parse(
  readFileSync(new URL('../fixtures/schema/v0.json', import.meta.url), 'utf8'),
) as { readonly synthetic: true; readonly canary: string; readonly record: LogicalRecord };

declare global {
  interface Window {
    syntheticListDatabases?: () => Promise<IDBDatabaseInfo[]>;
  }
}

const pageErrors = new WeakMap<Page, string[]>();
let vite: ViteDevServer | undefined;
let origin = '';

function trackErrors(page: Page): void {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
}

async function chooseRole(page: Page, role: 'owner' | 'partner'): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'Welcome to your cycle companion' }),
  ).toBeVisible();
  await expect(page.getByText(/no passphrase protection/i)).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue in browser anyway' }).click();
  await page
    .getByRole('button', { name: role === 'owner' ? "I'm tracking my cycle" : "I'm the partner" })
    .click();
}

async function finishOnboarding(page: Page, role: 'owner' | 'partner'): Promise<void> {
  if (role === 'owner') {
    await expect(page.getByRole('heading', { name: 'Your basics' })).toBeVisible();
    await expect(page.getByText(/no passphrase protection/i)).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Gentle reminders' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: /Who runs the app/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pair later and continue to Today' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText(/no passphrase protection/i)).toBeVisible();
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  await expect(page.getByTestId('recovery-code')).toHaveCount(0);
}

test.beforeEach(({ page }) => {
  trackErrors(page);
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test.beforeAll(async () => {
  vite = await createServer({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
    mode: 'unlocked-preview',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Preview server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

test('owner onboarding and synthetic changes survive a reload without a lock prompt', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(origin);
  await chooseRole(page, 'owner');
  await finishOnboarding(page, 'owner');

  await expect(page.getByRole('heading', { name: 'No cycle logs yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Period started', exact: true }).click();
  await expect(page.locator('.today-logged-summary')).toContainText('Flow: Medium');
  await expect(page.getByRole('heading', { name: 'No cycle logs yet' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('.today-logged-summary')).toContainText('Flow: Medium');
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  await expect(page.getByText(/no passphrase protection/i)).toBeVisible();
});

test('partner onboarding skips the lock without changing the partner view', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(origin);
  await chooseRole(page, 'partner');
  await finishOnboarding(page, 'partner');
  await expect(page.getByRole('navigation', { name: 'Partner navigation' })).toBeVisible();
});

test('an existing secured vault and its synthetic record remain unchanged', async ({ page }) => {
  test.setTimeout(60_000);
  const fixture = `${origin}/tests/e2e/lock-fixtures/?db=app`;
  await page.goto(fixture);
  const { code, positions } = await configureThroughUi(page);
  await fillConfirmation(page, code, positions);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.evaluate((record) => window.floLockDemo.saveSyntheticRecord(record), synthetic.record);
  const before = await page.evaluate(() => window.floLockDemo.rawDump());
  expect(before).not.toContain(synthetic.canary);

  await page.goto(`${origin}/?today=synthetic`);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);

  await page.goto(fixture);
  await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
  expect(await page.evaluate(() => window.floLockDemo.rawDump())).toBe(before);
  await page.getByLabel('Passphrase', { exact: true }).fill('synthetic harbor glimmer 74');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('Delete All removes both known vaults even without database enumeration', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`${origin}/tests/e2e/lock-fixtures/?db=app`);
  const { code, positions } = await configureThroughUi(page);
  await fillConfirmation(page, code, positions);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await page.addInitScript(() => {
    window.syntheticListDatabases = indexedDB.databases.bind(indexedDB);
    Object.defineProperty(Object.getPrototypeOf(indexedDB), 'databases', {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto(`${origin}/?today=synthetic`);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  expect(await page.evaluate(() => typeof indexedDB.databases)).toBe('undefined');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Delete all my data', exact: true }).click();
  await page.getByLabel('Type DELETE to confirm.').fill('DELETE');
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(
    page.getByRole('heading', { name: 'Some cleanup could not be confirmed' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('IndexedDB databases');

  const remaining = await page.evaluate(async () => {
    if (!window.syntheticListDatabases)
      throw new Error('Synthetic database inventory was not saved');
    return (await window.syntheticListDatabases()).map((database) => database.name);
  });
  expect(remaining).not.toContain('app');
  expect(remaining).not.toContain('app-unlocked-preview');

  await page.getByRole('button', { name: 'Continue to fresh setup' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome to your cycle companion' }),
  ).toBeVisible();
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
});

test('two first launches share one usable preview vault', async ({ page, context }) => {
  test.setTimeout(60_000);
  const second = await context.newPage();
  trackErrors(second);
  await Promise.all([
    page.goto(`${origin}/?today=synthetic`),
    second.goto(`${origin}/?today=synthetic`),
  ]);
  await Promise.all([
    expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible(),
    expect(second.getByRole('heading', { name: 'Today', exact: true })).toBeVisible(),
  ]);
  await second.reload();
  await expect(second.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(second.getByTestId('lock-screen')).toHaveCount(0);
  expect(pageErrors.get(second) ?? []).toEqual([]);
  await second.close();
});

test('missing lock metadata cannot overwrite an existing preview record', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`${origin}/?today=synthetic`);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  const countBefore = await page.evaluate(
    () =>
      new Promise<number>((resolveCount, reject) => {
        const request = indexedDB.open('app-unlocked-preview');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(['meta', 'records'], 'readwrite');
          transaction.objectStore('meta').delete('lockConfiguration');
          const count = transaction.objectStore('records').count();
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolveCount(count.result);
          };
        };
      }),
  );
  expect(countBefore).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByRole('alert')).toContainText('No data was reset or overwritten');
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
  const after = await page.evaluate(
    () =>
      new Promise<{ readonly count: number; readonly lockExists: boolean }>(
        (resolveState, reject) => {
          const request = indexedDB.open('app-unlocked-preview');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(['meta', 'records'], 'readonly');
            const lock = transaction.objectStore('meta').get('lockConfiguration');
            const count = transaction.objectStore('records').count();
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => {
              database.close();
              resolveState({ count: count.result, lockExists: lock.result !== undefined });
            };
          };
        },
      ),
  );
  expect(after).toEqual({ count: countBefore, lockExists: false });
});
