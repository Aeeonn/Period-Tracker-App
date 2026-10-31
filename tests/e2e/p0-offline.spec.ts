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

const syntheticPassphrase = 'synthetic harbor glimmer 74';
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
  await expect(page.getByText('Cycle day 12')).toBeVisible();

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error('The app worker did not activate');
  });
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
  await coldPage.goto(previewOrigin);
  await expect(coldPage.getByRole('heading', { name: 'Unlock this device' })).toBeVisible();
  await coldPage.getByLabel('Passphrase', { exact: true }).fill(syntheticPassphrase);
  await coldPage.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(coldPage.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(coldPage.getByText('Cycle day 12')).toBeVisible();
  await expect(coldPage.locator('.shell-preview-banner')).toContainText('synthetic placeholder');
  expect(coldPageErrors).toEqual([]);
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
    await Promise.all([page.goto(devOrigin), secondPage.goto(devOrigin)]);
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
