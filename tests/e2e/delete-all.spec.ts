import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { resolve } from 'node:path';
import { configureThroughUi, fillConfirmation } from './helpers/lock.ts';

let vite: ViteDevServer | undefined;
let origin = '';
const pageErrors = new WeakMap<Page, string[]>();
const OLD_LOCK_PASSPHRASE = 'synthetic harbor glimmer 74';
const FRESH_LOCK_PASSPHRASE = 'synthetic cedar lantern 86';

async function seedSyntheticStores(page: Page) {
  return page.evaluate(async () => {
    localStorage.setItem('flo-delete-synthetic-local', 'synthetic');
    sessionStorage.setItem('flo-delete-synthetic-session', 'synthetic');

    const cacheStorageAvailable = typeof caches !== 'undefined';
    if (cacheStorageAvailable) {
      const cache = await caches.open('flo-static-delete-synthetic');
      await cache.put('/synthetic-delete-entry', new Response('synthetic'));
    }

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('synthetic-delete-db', 1);
      request.addEventListener('upgradeneeded', () => {
        request.result.createObjectStore('synthetic', { keyPath: 'id' });
      });
      request.addEventListener('success', () => {
        request.result.close();
        resolve();
      });
      request.addEventListener('error', () => reject(request.error));
    });

    let opfsAvailable = false;
    try {
      if (typeof navigator.storage.getDirectory === 'function') {
        const root = await navigator.storage.getDirectory();
        const file = await root.getFileHandle('synthetic-delete-entry', { create: true });
        const writer = await file.createWritable();
        await writer.write('synthetic');
        await writer.close();
        opfsAvailable = true;
      }
    } catch {
      opfsAvailable = false;
    }

    return {
      cacheStorageAvailable,
      opfsAvailable,
      databaseEnumerationAvailable: typeof indexedDB.databases === 'function',
      serviceWorkersAvailable: 'serviceWorker' in navigator,
    };
  });
}

async function installSyntheticServiceWorker(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.register('/delete-test-sw.js', {
      scope: '/',
    });
    if (registration.active?.state === 'activated') return true;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('Synthetic service worker timed out')),
        10_000,
      );
      const finish = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      if (registration.active?.state === 'activated') {
        finish();
        return;
      }
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'activated') finish();
        });
      });
      navigator.serviceWorker.ready.then(finish, reject);
    });
    return true;
  });
}

async function completeOwnerOnboarding(page: Page, passphrase: string): Promise<void> {
  await page.getByRole('button', { name: "I'm tracking my cycle" }).click();
  const { code, positions } = await configureThroughUi(page, passphrase);
  await fillConfirmation(page, code, positions);
  await expect(page.getByRole('heading', { name: 'Your basics' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gentle reminders' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Who runs the app.s servers\?/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pair later and continue to Today' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({
    timeout: 15_000,
  });
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
  if (!address || typeof address === 'string') throw new Error('Delete test server did not start');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
  vite = undefined;
});

test('T-CON-20 @delete erases local stores and allows a fresh lock after typed confirmation', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.route('**/delete-test-sw.js', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: "self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting())); self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));",
    }),
  );
  await page.goto(`${origin}/`);
  await expect(
    page.getByRole('heading', { name: 'Welcome to your cycle companion' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make room for the app' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue in browser anyway' }).click();
  await expect(page.getByRole('heading', { name: 'Which brings you here?' })).toBeVisible();
  await completeOwnerOnboarding(page, OLD_LOCK_PASSPHRASE);

  await page.getByRole('link', { name: 'Settings' }).click();
  const seeded = await seedSyntheticStores(page);
  const serviceWorkerInstalled = await installSyntheticServiceWorker(page);
  if (seeded.serviceWorkersAvailable) expect(serviceWorkerInstalled).toBe(true);

  await page.getByRole('button', { name: 'Delete all my data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete all my data?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete everything' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const retainedAfterCancel = await page.evaluate(async () => ({
    local: localStorage.getItem('flo-delete-synthetic-local'),
    session: sessionStorage.getItem('flo-delete-synthetic-session'),
    databases: (await indexedDB.databases()).map((database) => database.name),
    caches: typeof caches === 'undefined' ? [] : await caches.keys(),
  }));
  expect(retainedAfterCancel.local).toBe('synthetic');
  expect(retainedAfterCancel.session).toBe('synthetic');
  expect(retainedAfterCancel.databases).toContain('app');
  expect(retainedAfterCancel.databases).toContain('synthetic-delete-db');
  if (seeded.cacheStorageAvailable)
    expect(retainedAfterCancel.caches).toContain('flo-static-delete-synthetic');

  await page.getByRole('button', { name: 'Delete all my data', exact: true }).click();
  await page.getByLabel('Type DELETE to confirm.').fill('delete');
  await expect(page.getByRole('button', { name: 'Delete everything' })).toBeDisabled();
  await page.getByLabel('Type DELETE to confirm.').fill('DELETE');
  await expect(page.getByRole('button', { name: 'Delete everything' })).toBeEnabled();
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(
    page.getByRole('heading', {
      name: /Your local data was removed|Some cleanup could not be confirmed/,
    }),
  ).toBeVisible({ timeout: 20_000 });

  const remaining = await page.evaluate(async () => {
    let opfsEntries: string[] | null = null;
    if (typeof navigator.storage.getDirectory === 'function') {
      try {
        const root = await navigator.storage.getDirectory();
        opfsEntries = [];
        for await (const name of root.keys()) opfsEntries.push(name);
      } catch {
        opfsEntries = null;
      }
    }
    return {
      local: localStorage.getItem('flo-delete-synthetic-local'),
      session: sessionStorage.getItem('flo-delete-synthetic-session'),
      databases: (await indexedDB.databases()).map((database) => database.name),
      caches: typeof caches === 'undefined' ? [] : await caches.keys(),
      registrations:
        'serviceWorker' in navigator
          ? (await navigator.serviceWorker.getRegistrations()).length
          : 0,
      opfsEntries,
    };
  });

  expect(remaining.local).toBeNull();
  expect(remaining.session).toBeNull();
  expect(remaining.databases).toEqual([]);
  expect(remaining.caches).not.toContain('flo-static-delete-synthetic');
  expect(remaining.registrations).toBe(0);
  if (seeded.opfsAvailable) expect(remaining.opfsEntries).toEqual([]);
  if (serviceWorkerInstalled) expect(remaining.registrations).toBe(0);

  const failures = await page.locator('.delete-screen__failure li').allTextContents();
  const expectedFailures: string[] = [];
  if (!seeded.opfsAvailable) expectedFailures.push('OPFS');
  if (!seeded.cacheStorageAvailable) expectedFailures.push('Cache Storage');
  if (!seeded.databaseEnumerationAvailable) expectedFailures.push('IndexedDB databases');
  if (!seeded.serviceWorkersAvailable) expectedFailures.push('service workers');
  expect(failures).toEqual(expectedFailures);
  await expect(page.getByRole('heading', { name: 'What this app cannot erase' })).toBeVisible();
  await expect(page.getByText('Files you exported or saved somewhere else.')).toBeVisible();

  await page.getByRole('button', { name: 'Continue to fresh setup' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to your cycle companion' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make room for the app' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue in browser anyway' }).click();
  await expect(page.getByRole('heading', { name: 'Which brings you here?' })).toBeVisible();
  await page.getByRole('button', { name: "I'm tracking my cycle" }).click();
  await expect(page.getByRole('heading', { name: 'Create your lock' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unlock this device' })).toHaveCount(0);

  const freshLock = await configureThroughUi(page, FRESH_LOCK_PASSPHRASE);
  await fillConfirmation(page, freshLock.code, freshLock.positions);
  await expect(page.getByRole('heading', { name: 'Your basics' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
  await page.getByLabel('Passphrase', { exact: true }).fill(OLD_LOCK_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'That secret did not unlock this device. Try again.',
  );
  await page.getByLabel('Passphrase', { exact: true }).fill(FRESH_LOCK_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to your cycle companion' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
});
