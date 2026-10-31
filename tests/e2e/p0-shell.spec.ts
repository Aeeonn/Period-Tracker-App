import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';

const syntheticPassphrase = 'synthetic harbor glimmer 74';
let vite: ViteDevServer | undefined;
let origin = '';
const pageErrors = new WeakMap<Page, string[]>();

async function openApp(page: Page, query = ''): Promise<void> {
  await page.goto(`${origin}/${query}`);
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create your lock' })).toBeVisible();
}

async function configureApp(page: Page): Promise<void> {
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

async function seedSchemaZeroDatabase(page: Page): Promise<void> {
  await page.goto(`${origin}/tests/e2e/db-store-fixtures/`);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('app', 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          const meta = database.createObjectStore('meta', { keyPath: 'key' });
          const records = database.createObjectStore('records', { keyPath: 'id' });
          records.createIndex('type', 'type', { unique: false });
          database.createObjectStore('outbox', { keyPath: 'id' });
          database.createObjectStore('snapshots', { keyPath: 'id' });
          meta.put({ key: 'schemaVersion', value: 0 });
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error ?? new Error('Synthetic DB seed failed'));
      }),
  );
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
  if (!address || typeof address === 'string') throw new Error('App shell server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

test('P0 shell keeps the synthetic preview and owner routes after the lock gate', async ({
  page,
}) => {
  await openApp(page);
  await expect(page.locator('.shell-root')).toHaveCount(0);
  await configureApp(page);
  await expect(page.getByText('Preview — synthetic data only')).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('Cycle day 12')).toBeVisible();
  await expect(page.locator('.today-logged-summary')).toContainText('Energy');
  await expect(page.locator('.today-logged-summary')).toContainText('Cramps');

  await page.getByRole('link', { name: 'Calendar' }).click();
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Log' }).click();
  await expect(page.getByRole('heading', { name: 'Log', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});

test('P0 shell routes the partner preview without exposing owner-only tabs', async ({ page }) => {
  await openApp(page, '?role=partner');
  await configureApp(page);

  await expect(page.locator('.shell-root')).toHaveAttribute('data-role', 'partner');
  await expect(page.getByRole('navigation', { name: 'Partner navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Insights' })).toHaveCount(0);
  await expect(
    page.getByText('This partner-view placeholder contains no shared data.'),
  ).toBeVisible();
});

test('runtime migrates an existing schema-zero database before opening the record store', async ({
  page,
}) => {
  await seedSchemaZeroDatabase(page);
  await openApp(page);
  await configureApp(page);

  const schemaVersion = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('app');
        request.onerror = () => reject(request.error ?? new Error('Synthetic DB read failed'));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('meta', 'readonly');
          const metaRequest = transaction.objectStore('meta').get('schemaVersion') as IDBRequest<
            { value: number } | undefined
          >;
          metaRequest.onsuccess = () => {
            database.close();
            const value = metaRequest.result?.value;
            if (typeof value !== 'number') {
              reject(new Error('Migrated schema version was not stored'));
              return;
            }
            resolve(value);
          };
          metaRequest.onerror = () => reject(metaRequest.error ?? new Error('Schema read failed'));
        };
      }),
  );
  expect(schemaVersion).toBe(1);
  await expect(page.locator('.shell-root')).toBeVisible();
});
