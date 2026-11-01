import { expect, test, type Page } from '@playwright/test';
import {
  createServer as createNodeServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { startCspTestServer } from './csp-fixtures/server';

const syntheticPassphrase = 'synthetic harbor glimmer 74';
const shellHeaderNames = [
  'content-security-policy',
  'referrer-policy',
  'x-content-type-options',
  'permissions-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'content-type',
] as const;
let devServer: ViteDevServer | undefined;
let offlineServer: Server | undefined;
let offlineRoot = '';
let devOrigin = '';
let previewOrigin = '';
let originOnline = true;
const pageErrors = new WeakMap<Page, string[]>();

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function sendText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
}

async function serveOfflineRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', previewOrigin || 'http://127.0.0.1');
  if (requestUrl.pathname === '/__test/offline') {
    originOnline = false;
    response.writeHead(204, { 'cache-control': 'no-store' }).end();
    return;
  }
  if (!originOnline) {
    request.socket.destroy();
    return;
  }

  const requestPath = decodeURIComponent(
    requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname,
  );
  const filePath = resolve(offlineRoot, `.${requestPath}`);
  if (!filePath.startsWith(`${offlineRoot}${sep}`)) {
    sendText(response, 400, 'invalid path');
    return;
  }
  try {
    const body = await readFile(filePath);
    const headers: Record<string, string> = {
      'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'content-length': String(body.byteLength),
    };
    if (requestPath === '/sw.js') headers['cache-control'] = 'no-cache';
    response.writeHead(200, headers).end(body);
  } catch {
    sendText(response, 404, 'not found');
  }
}

async function listenOnEphemeralPort(httpServer: Server): Promise<number> {
  await new Promise<void>((resolveListen, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Offline test server did not bind');
  return address.port;
}

interface RestartReadiness {
  readonly writesFlushed: true;
  readonly transactionsClosed: true;
  readonly appLocked: true;
  readonly writesBlocked: true;
}

interface CoordinationProbe {
  beginWrite(): () => void;
  start(): Promise<void>;
  prepareForRestart(): Promise<RestartReadiness | null>;
  cancelRestart(): void | Promise<void>;
  dispose(): void;
}

interface CoordinationState {
  phase: 'idle' | 'preparing' | 'locked' | 'cancelled';
  done: boolean;
  readiness: RestartReadiness | null;
}

declare global {
  interface Window {
    __p0Coordinator?: CoordinationProbe;
    __p0State?: CoordinationState;
    __p0WriteRelease?: () => void;
  }
}

async function continueWelcomeToLock(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Welcome to your cycle companion' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make room for the app' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue in browser anyway' }).click();
  await expect(page.getByRole('heading', { name: 'Which brings you here?' })).toBeVisible();
  await page.getByRole('button', { name: "I'm tracking my cycle" }).click();
}

async function finishOwnerOnboarding(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Your basics' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gentle reminders' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Who runs the app/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pair later and continue to Today' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

async function openSyntheticPreviewAfterSetup(page: Page, appOrigin: string): Promise<void> {
  await waitForActivatedController(page);
  await page.goto(`${appOrigin}/?today=synthetic`);
  await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
  await page.getByLabel('Passphrase', { exact: true }).fill(syntheticPassphrase);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

async function waitForActivatedController(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    return (
      registration?.active?.state === 'activated' &&
      navigator.serviceWorker.controller?.state === 'activated'
    );
  });
}

async function configureApp(page: Page): Promise<void> {
  await continueWelcomeToLock(page);
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
  await finishOwnerOnboarding(page);
  await expect(page.locator('.shell-root')).toBeVisible();
}

function listenForPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
  return errors;
}

async function createDevServer(): Promise<{
  readonly server: ViteDevServer;
  readonly origin: string;
}> {
  const server = await createViteServer({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('App dev server did not start');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

test.beforeEach(({ page }) => {
  const errors = listenForPageErrors(page);
  pageErrors.set(page, errors);
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test.beforeAll(async () => {
  const dev = await createDevServer();
  devServer = dev.server;
  devOrigin = dev.origin;
  offlineRoot = await mkdtemp(join(tmpdir(), 'flo-p0-offline-'));
  await cp(resolve(process.cwd(), 'dist'), offlineRoot, { recursive: true });
});

test.beforeEach(async () => {
  originOnline = true;
  offlineServer = createNodeServer((request, response) => {
    void serveOfflineRequest(request, response).catch((error: unknown) => {
      sendText(response, 500, error instanceof Error ? error.message : String(error));
    });
  });
  const port = await listenOnEphemeralPort(offlineServer);
  previewOrigin = `http://127.0.0.1:${port}`;
});

test.afterEach(async () => {
  if (offlineServer?.listening) {
    await new Promise<void>((resolveClose, reject) => {
      offlineServer?.close((error) => (error ? reject(error) : resolveClose()));
    });
  }
  offlineServer = undefined;
});

test.afterAll(async () => {
  if (offlineRoot) await rm(offlineRoot, { recursive: true, force: true });
  offlineRoot = '';
  await devServer?.close();
  devServer = undefined;
});

test('T-SW-01 @sw offline cold start shows Today after unlocking the integrated app', async ({
  page,
  context,
}) => {
  await page.goto(previewOrigin);
  await configureApp(page);
  await openSyntheticPreviewAfterSetup(page, previewOrigin);
  await expect(page.getByText('Cycle day 12')).toBeVisible();

  await waitForActivatedController(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  const offlineStatus = await page.evaluate(async () => {
    const response = await fetch('/__test/offline', { cache: 'no-store' });
    return response.status;
  });
  expect(offlineStatus).toBe(204);
  await page.close();
  const coldPage = await context.newPage();
  const coldPageErrors = listenForPageErrors(coldPage);
  await coldPage.goto(`${previewOrigin}/?today=synthetic`);
  await expect(coldPage.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
  await coldPage.getByLabel('Passphrase', { exact: true }).fill(syntheticPassphrase);
  await coldPage.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(coldPage.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(coldPage.getByText('Cycle day 12')).toBeVisible();
  await expect(coldPage.locator('.shell-preview-banner')).toContainText('synthetic data only');
  expect(coldPageErrors).toEqual([]);
});

test.describe('Pages-canonicalized navigation fallback', () => {
  test.use({ ignoreHTTPSErrors: true });

  test('serves a nonredirected shell for an uncached synthetic query navigation @sw', async ({
    page,
  }) => {
    const server = await startCspTestServer(undefined, '127.0.0.1', 0, {
      allowControlledOutage: true,
      canonicalizeIndexToRoot: true,
    });

    try {
      const rootResponse = await page.goto(server.baseURL, { waitUntil: 'domcontentloaded' });
      expect(rootResponse?.status()).toBe(200);
      const rootBody = await rootResponse!.body();
      const rootHeaders = rootResponse!.headers();

      await configureApp(page);
      await waitForActivatedController(page);

      const cacheState = await page.evaluate(async (headerNames) => {
        const name = (await caches.keys()).find((cacheName) => cacheName.startsWith('flo-static-'));
        if (!name) throw new Error('The app shell cache was not installed');
        const cache = await caches.open(name);
        const root = await cache.match(new URL('/', location.origin).href);
        const index = await cache.match(new URL('/index.html', location.origin).href);
        const query = await cache.match(new URL('/?today=synthetic', location.origin).href);
        if (!root || !index) throw new Error('The root and index shell responses must be cached');
        const digest = async (response: Response) => {
          const bytes = await response.arrayBuffer();
          const hash = await crypto.subtle.digest('SHA-256', bytes);
          return {
            bytes: bytes.byteLength,
            sha256: Array.from(new Uint8Array(hash), (byte) =>
              byte.toString(16).padStart(2, '0'),
            ).join(''),
          };
        };
        return {
          rootRedirected: root.redirected,
          indexRedirected: index.redirected,
          queryCached: query !== undefined,
          indexStatus: index.status,
          indexHeaders: Object.fromEntries(
            headerNames.map((headerName) => [headerName, index.headers.get(headerName)]),
          ),
          rootBody: await digest(root),
          indexBody: await digest(index),
        };
      }, [...shellHeaderNames]);
      const expectedShellHeaders = Object.fromEntries(
        shellHeaderNames.map((headerName) => [headerName, rootHeaders[headerName]]),
      );
      expect(cacheState.rootRedirected).toBe(false);
      expect(cacheState.indexRedirected).toBe(true);
      expect(cacheState.queryCached).toBe(false);
      expect(cacheState.indexStatus).toBe(200);
      expect(cacheState.indexHeaders).toEqual(expectedShellHeaders);
      expect(cacheState.indexBody).toEqual(cacheState.rootBody);
      process.stdout.write(
        `[p0-navigation] root/index bytes=${cacheState.rootBody.bytes}/${cacheState.indexBody.bytes}; sha256=${cacheState.rootBody.sha256}; redirected=false/true; headers=${shellHeaderNames.length} preserved\n`,
      );

      const rootReloadResponse = await page.reload({ waitUntil: 'domcontentloaded' });
      expect(rootReloadResponse?.status()).toBe(200);
      expect(rootReloadResponse?.fromServiceWorker()).toBe(true);
      expect(await rootReloadResponse!.body()).toEqual(rootBody);
      expect(
        Object.fromEntries(
          shellHeaderNames.map((headerName) => [
            headerName,
            rootReloadResponse?.headers()[headerName],
          ]),
        ),
      ).toEqual(expectedShellHeaders);

      let queryResponse: Awaited<ReturnType<Page['goto']>> | null = null;
      let queryNavigationError = '';
      try {
        queryResponse = await page.goto(`${server.baseURL}?today=synthetic`, {
          waitUntil: 'domcontentloaded',
        });
      } catch (error) {
        queryNavigationError =
          error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      }

      expect(
        queryNavigationError,
        'query navigation must not reject a redirected SW response',
      ).toBe('');
      expect(queryResponse).not.toBeNull();
      expect(queryResponse?.status()).toBe(200);
      expect(queryResponse?.fromServiceWorker()).toBe(true);
      const queryBody = await queryResponse!.body();
      expect(queryBody).toEqual(rootBody);
      expect(
        Object.fromEntries(
          shellHeaderNames.map((headerName) => [
            headerName,
            queryResponse?.headers()[headerName],
          ]),
        ),
      ).toEqual(
        expectedShellHeaders,
      );
      process.stdout.write(
        `[p0-navigation] query bytes=${queryBody.byteLength}; fromServiceWorker=true; redirected-response-error=0; headers=${shellHeaderNames.length} preserved\n`,
      );
      await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
      await page.getByLabel('Passphrase', { exact: true }).fill(syntheticPassphrase);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
      await expect(page.locator('.shell-preview-banner')).toContainText('synthetic data only');

      server.setOriginAvailable(false);
      const outageRootResponse = await page.goto(server.baseURL, {
        waitUntil: 'domcontentloaded',
      });
      expect(outageRootResponse?.status()).toBe(200);
      expect(outageRootResponse?.fromServiceWorker()).toBe(true);
      const outageRootBody = await outageRootResponse!.body();
      expect(outageRootBody).toEqual(rootBody);
      expect(
        Object.fromEntries(
          shellHeaderNames.map((headerName) => [
            headerName,
            outageRootResponse?.headers()[headerName],
          ]),
        ),
      ).toEqual(expectedShellHeaders);
      await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
      await page.getByLabel('Passphrase', { exact: true }).fill(syntheticPassphrase);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
      process.stdout.write(
        `[p0-navigation] controlled-outage root bytes=${outageRootBody.byteLength}; fromServiceWorker=true; headers=${shellHeaderNames.length} preserved\n`,
      );

      const outageQueryResponse = await page.goto(
        `${server.baseURL}?today=synthetic&outage=synthetic`,
        { waitUntil: 'domcontentloaded' },
      );
      expect(outageQueryResponse?.status()).toBe(200);
      expect(outageQueryResponse?.fromServiceWorker()).toBe(true);
      const outageQueryBody = await outageQueryResponse!.body();
      expect(outageQueryBody).toEqual(rootBody);
      expect(
        Object.fromEntries(
          shellHeaderNames.map((headerName) => [
            headerName,
            outageQueryResponse?.headers()[headerName],
          ]),
        ),
      ).toEqual(expectedShellHeaders);
      await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
      await page.getByLabel('Passphrase', { exact: true }).fill(syntheticPassphrase);
      await page.getByRole('button', { name: 'Unlock', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
      await expect(page.locator('.shell-preview-banner')).toContainText('synthetic data only');
      process.stdout.write(
        `[p0-navigation] controlled-outage query bytes=${outageQueryBody.byteLength}; fromServiceWorker=true; headers=${shellHeaderNames.length} preserved; pageErrors=${(pageErrors.get(page) ?? []).length}\n`,
      );
      expect(pageErrors.get(page) ?? []).toEqual([]);
    } finally {
      await server.close();
    }
  });
});

async function installCoordinationProbe(
  page: Page,
  names: { readonly channelName: string; readonly windowLockName: string },
): Promise<void> {
  await page.evaluate(async ({ channelName, windowLockName }) => {
    const moduleUrl = new URL('/src/app/update-coordinator.ts', location.href).href;
    const module = await import(moduleUrl);
    window.__p0State = { phase: 'idle', done: false, readiness: null };
    const coordinator = module.createAppUpdateCoordinator({
      channelName,
      windowLockName,
      onPreparing: () => {
        if (window.__p0State) window.__p0State.phase = 'preparing';
      },
      onLocked: () => {
        if (window.__p0State) window.__p0State.phase = 'locked';
      },
      onCancelled: () => {
        if (window.__p0State) window.__p0State.phase = 'cancelled';
      },
    }) as CoordinationProbe;
    await coordinator.start();
    window.__p0Coordinator = coordinator;
  }, names);
}

test('app update barrier drains writes in every open window before activation @sw', async ({
  page,
  context,
}) => {
  const secondPage = await context.newPage();
  const secondPageErrors = listenForPageErrors(secondPage);
  const requestId = randomUUID();
  const names = {
    channelName: `flo:p0-update-test:${requestId}`,
    windowLockName: `flo:p0-window-test:${requestId}`,
  };

  try {
    await page.goto(devOrigin);
    await configureApp(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
    await secondPage.goto(devOrigin);
    await expect(secondPage.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
    await Promise.all([
      page.getByTestId('lock-screen').waitFor(),
      secondPage.getByTestId('lock-screen').waitFor(),
    ]);
    await Promise.all([
      installCoordinationProbe(page, names),
      installCoordinationProbe(secondPage, names),
    ]);
    await secondPage.evaluate(() => {
      const release = window.__p0Coordinator?.beginWrite();
      if (release) window.__p0WriteRelease = release;
    });
    await page.evaluate(() => {
      const coordinator = window.__p0Coordinator;
      if (!coordinator || !window.__p0State) throw new Error('Probe coordinator is missing');
      window.__p0State.done = false;
      void coordinator.prepareForRestart().then((readiness) => {
        if (!window.__p0State) return;
        window.__p0State.readiness = readiness;
        window.__p0State.done = true;
      });
    });

    await secondPage.waitForFunction(() => window.__p0State?.phase === 'preparing');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__p0State?.done)).toBe(false);
    await secondPage.evaluate(() => window.__p0WriteRelease?.());
    await page.waitForFunction(() => window.__p0State?.done === true);
    expect(await page.evaluate(() => window.__p0State?.readiness)).toEqual({
      writesFlushed: true,
      transactionsClosed: true,
      appLocked: true,
      writesBlocked: true,
    });

    await page.evaluate(async () => window.__p0Coordinator?.cancelRestart());
    await secondPage.waitForFunction(() => window.__p0State?.phase === 'cancelled');
    await secondPage.evaluate(() => {
      const release = window.__p0Coordinator?.beginWrite();
      release?.();
    });
    expect(secondPageErrors).toEqual([]);
  } finally {
    await Promise.all([
      page.evaluate(() => window.__p0Coordinator?.dispose()).catch(() => undefined),
      secondPage.evaluate(() => window.__p0Coordinator?.dispose()).catch(() => undefined),
    ]);
    await secondPage.close();
  }
});
