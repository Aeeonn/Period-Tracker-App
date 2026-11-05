import { expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { preview, type PreviewServer } from 'vite';
import { buildPrecache } from '../../tools/build-precache.ts';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let buildDirectory: string | undefined;
let securedServer: PreviewServer | undefined;
let unlockedServer: PreviewServer | undefined;
let securedOrigin = '';
let unlockedOrigin = '';
let previousNodeEnv: string | undefined;

function origin(server: PreviewServer): string {
  const address = server.httpServer.address();
  if (!address || typeof address === 'string')
    throw new Error('Built preview server did not start');
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: PreviewServer | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolveClose, reject) => {
    server.httpServer.close((error) => (error ? reject(error) : resolveClose()));
  });
}

test.beforeAll(async () => {
  buildDirectory = await mkdtemp(join(tmpdir(), 'flo-unlocked-preview-'));
  const securedDirectory = join(buildDirectory, 'secured');
  const unlockedDirectory = join(buildDirectory, 'unlocked');
  const previousFlag = process.env.VITE_FLO_UNLOCKED_PREVIEW;
  previousNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.VITE_FLO_UNLOCKED_PREVIEW;
    await buildPrecache(securedDirectory);
    process.env.VITE_FLO_UNLOCKED_PREVIEW = 'true';
    await buildPrecache(unlockedDirectory);

    const configFile = resolve(process.cwd(), 'vite.config.ts');
    securedServer = await preview({
      configFile,
      build: { outDir: securedDirectory },
      preview: { host: '127.0.0.1', port: 0, strictPort: false },
    });
    unlockedServer = await preview({
      configFile,
      build: { outDir: unlockedDirectory },
      preview: { host: '127.0.0.1', port: 0, strictPort: false },
    });
    securedOrigin = origin(securedServer);
    unlockedOrigin = origin(unlockedServer);
  } finally {
    if (previousFlag === undefined) delete process.env.VITE_FLO_UNLOCKED_PREVIEW;
    else process.env.VITE_FLO_UNLOCKED_PREVIEW = previousFlag;
    // Vite mutates NODE_ENV during builds; don't affect later tests in this worker.
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test.afterAll(async () => {
  await Promise.all([closeServer(securedServer), closeServer(unlockedServer)]);
  if (buildDirectory !== undefined) await rm(buildDirectory, { recursive: true, force: true });
});

test('a normal production build still requires the lock', async ({ page }) => {
  expect(process.env.NODE_ENV).toBe(previousNodeEnv);
  await page.goto(`${securedOrigin}/?today=synthetic`);
  await expect(page.getByRole('heading', { name: 'Create your lock' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toHaveCount(0);
});

test('an explicitly opted-in production preview opens without a passphrase', async ({ page }) => {
  await page.goto(`${unlockedOrigin}/?today=synthetic`);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText(/no passphrase protection/i)).toBeVisible();
  await expect(page.getByTestId('lock-screen')).toHaveCount(0);
});
