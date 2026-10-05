import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, type Page } from '@playwright/test';
import { writePrecacheWorker } from '../../tools/build-precache';

interface SyntheticWriteFixture {
  synthetic: true;
  id: string;
  provenance: string;
  value: string;
}

interface AppUpdateTestApi {
  beginWrite(): () => void;
}

declare global {
  interface Window {
    floAppUpdate?: AppUpdateTestApi;
    __releaseSyntheticWrite?: () => void;
    __recordServiceWorkerEvent?: (event: string) => void;
  }
}

const TRACE_KEY = 'synthetic-service-worker-trace';
const MIME_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

let temporaryRoot = '';
let server: Server | undefined;
let appOrigin = '';
let activeBuild: 'v1' | 'v2' = 'v1';
let originOnline = true;
let pendingWrite: SyntheticWriteFixture;

function sendText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
}

async function serveRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', appOrigin || 'http://127.0.0.1');
  if (requestUrl.pathname === '/__test/switch') {
    const requestedBuild = requestUrl.searchParams.get('build');
    if (requestedBuild !== 'v1' && requestedBuild !== 'v2') {
      sendText(response, 400, 'unknown synthetic build');
      return;
    }
    activeBuild = requestedBuild;
    originOnline = true;
    response.writeHead(204, { 'cache-control': 'no-store' }).end();
    return;
  }
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
  const buildRoot = resolve(temporaryRoot, activeBuild);
  const filePath = resolve(buildRoot, `.${requestPath}`);
  if (!filePath.startsWith(`${buildRoot}${sep}`)) {
    sendText(response, 400, 'invalid path');
    return;
  }

  try {
    const body = await readFile(filePath);
    const headers: Record<string, string> = {
      'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      'content-length': String(body.byteLength),
    };
    if (requestPath === '/sw.js') {
      headers['cache-control'] = 'no-cache, no-store, must-revalidate';
    }
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
  if (!address || typeof address === 'string')
    throw new Error('Test server did not bind a TCP port.');
  return address.port;
}

async function loadSyntheticFixture(): Promise<SyntheticWriteFixture> {
  const contents = await readFile(
    resolve(process.cwd(), 'tests/e2e/service-worker-fixtures/pending-write.json'),
    'utf8',
  );
  const fixture: unknown = JSON.parse(contents);
  if (
    typeof fixture !== 'object' ||
    fixture === null ||
    !('synthetic' in fixture) ||
    fixture.synthetic !== true ||
    !('id' in fixture) ||
    typeof fixture.id !== 'string' ||
    !('provenance' in fixture) ||
    typeof fixture.provenance !== 'string' ||
    !('value' in fixture) ||
    typeof fixture.value !== 'string'
  ) {
    throw new Error('The service-worker write fixture must be explicitly synthetic.');
  }
  return fixture as SyntheticWriteFixture;
}

async function waitForAppController(page: Page): Promise<void> {
  await page.waitForFunction(
    async () =>
      (await navigator.serviceWorker.getRegistration('/'))?.active?.state === 'activated' &&
      navigator.serviceWorker.controller !== null &&
      window.floAppUpdate !== undefined,
  );
}

async function openSyntheticStore(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolveOpen, rejectOpen) => {
        const request = indexedDB.open('synthetic-sw-update-evidence', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('records')) {
            request.result.createObjectStore('records', { keyPath: 'id' });
          }
        };
        request.onerror = () => rejectOpen(request.error);
        request.onsuccess = () => {
          request.result.close();
          resolveOpen();
        };
      }),
  );
}

async function readSyntheticRecord(page: Page, id: string): Promise<SyntheticWriteFixture | null> {
  return page.evaluate(
    (recordId) =>
      new Promise<SyntheticWriteFixture | null>((resolveRead, rejectRead) => {
        const request = indexedDB.open('synthetic-sw-update-evidence', 1);
        request.onerror = () => rejectRead(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('records', 'readonly');
          const read = transaction.objectStore('records').get(recordId);
          read.onerror = () => rejectRead(read.error);
          read.onsuccess = () => {
            database.close();
            resolveRead((read.result as SyntheticWriteFixture | undefined) ?? null);
          };
        };
      }),
    id,
  );
}

async function expectOnlyOwnedCacheWasDeleted(page: Page, firstCacheName: string): Promise<void> {
  const cacheNames = await page.evaluate(async () => caches.keys());
  expect(cacheNames.filter((name) => name.startsWith('flo-static-'))).toHaveLength(1);
  expect(cacheNames).not.toContain(firstCacheName);
  expect(cacheNames).toContain('user-records-cache');
  expect(cacheNames).toContain('flo-user-record-storage');
}

test.beforeEach(async () => {
  pendingWrite = await loadSyntheticFixture();
  temporaryRoot = await mkdtemp(join(tmpdir(), 'flo-service-worker-'));
  const outputRoot = resolve(process.cwd(), 'dist');
  const versionOne = resolve(temporaryRoot, 'v1');
  const versionTwo = resolve(temporaryRoot, 'v2');
  await cp(outputRoot, versionOne, { recursive: true });
  await cp(versionOne, versionTwo, { recursive: true });
  await writeFile(resolve(versionTwo, 'synthetic-update-marker.txt'), 'synthetic build v2\n');
  await writePrecacheWorker(versionTwo);

  activeBuild = 'v1';
  originOnline = true;
  server = createServer((request, response) => {
    void serveRequest(request, response).catch((error: unknown) => {
      sendText(response, 500, error instanceof Error ? error.message : String(error));
    });
  });
  const port = await listenOnEphemeralPort(server);
  appOrigin = `http://127.0.0.1:${port}`;
});

test.afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolveClose, reject) => {
      server?.close((error) => (error ? reject(error) : resolveClose()));
    });
  }
  server = undefined;
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = '';
});

test('T-SW-01 @sw cold navigation renders the installed shell after the origin goes offline', async ({
  page,
  context,
}) => {
  await page.addInitScript((traceKey) => {
    window.__recordServiceWorkerEvent = (event) => {
      const current = JSON.parse(sessionStorage.getItem(traceKey) ?? '[]') as string[];
      current.push(event);
      sessionStorage.setItem(traceKey, JSON.stringify(current));
    };
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (typeof event.data?.type === 'string') {
        window.__recordServiceWorkerEvent?.(`message:${event.data.type}`);
      }
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.__recordServiceWorkerEvent?.('controllerchange');
    });
  }, TRACE_KEY);

  await page.goto(appOrigin);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await waitForAppController(page);
  const v1Cache = await page.evaluate(
    async () => (await caches.keys()).find((name) => name.startsWith('flo-static-')) ?? null,
  );
  expect(v1Cache).toBeTruthy();

  await page.evaluate(() => fetch('/__test/offline', { cache: 'no-store' }));
  await page.close();
  const coldPage = await context.newPage();
  await coldPage.goto(appOrigin);
  await expect(coldPage.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(coldPage.getByText('Static preview · synthetic placeholder content')).toBeVisible();
});

test('T-SW-02 @sw waits for the pending app write before activating v2 and preserves its record', async ({
  page,
}) => {
  await page.addInitScript((traceKey) => {
    window.__recordServiceWorkerEvent = (event) => {
      const current = JSON.parse(sessionStorage.getItem(traceKey) ?? '[]') as string[];
      current.push(event);
      sessionStorage.setItem(traceKey, JSON.stringify(current));
    };
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (typeof event.data?.type === 'string') {
        window.__recordServiceWorkerEvent?.(`message:${event.data.type}`);
      }
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.__recordServiceWorkerEvent?.('controllerchange');
    });
  }, TRACE_KEY);

  await page.goto(appOrigin);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await waitForAppController(page);
  await openSyntheticStore(page);

  await page.evaluate(async () => {
    await Promise.all(
      ['user-records-cache', 'flo-user-record-storage'].map(async (name) => {
        const cache = await caches.open(name);
        await cache.put('/synthetic-cache-probe', new Response('synthetic fixture'));
      }),
    );
    if (!window.floAppUpdate) throw new Error('App write-gate integration is missing.');
    window.__releaseSyntheticWrite = window.floAppUpdate.beginWrite();
  });

  const oldCacheName = await page.evaluate(
    async () => (await caches.keys()).find((name) => name.startsWith('flo-static-')) ?? null,
  );
  expect(oldCacheName).toBeTruthy();

  await page.evaluate(async () => {
    await fetch('/__test/switch?build=v2', { cache: 'no-store' });
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) throw new Error('Service-worker registration is missing.');
    await registration.update();
  });

  const updateStatus = page.getByRole('status');
  await expect(updateStatus).toContainText(
    'An update is ready. Save your changes before restarting.',
  );
  await expect(updateStatus.getByRole('button', { name: 'Restart now' })).toBeEnabled();

  const pendingWorkerState = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const waiting = registration?.waiting;
    if (!waiting) throw new Error('v2 did not reach the waiting state.');
    waiting.postMessage({
      type: 'SKIP_WAITING',
      requestId: 'synthetic-invalid-request',
      writesFlushed: false,
      transactionsClosed: true,
      appLocked: true,
      writesBlocked: true,
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    return {
      waitingState: registration?.waiting?.state,
      staticCaches: (await caches.keys()).filter((name) => name.startsWith('flo-static-')),
    };
  });
  expect(pendingWorkerState.waitingState).toBe('installed');
  expect(pendingWorkerState.staticCaches).toHaveLength(2);
  expect(pendingWorkerState.staticCaches).toContain(oldCacheName);
  expect(await readSyntheticRecord(page, pendingWrite.id)).toBeNull();
  console.log(
    `T-SW-02 disconfirming request: waiting=${pendingWorkerState.waitingState}; both version caches retained; false writesFlushed did not activate.`,
  );

  await page.evaluate(() => window.__recordServiceWorkerEvent?.('restart-requested'));
  await updateStatus.getByRole('button', { name: 'Restart now' }).click();
  await expect(updateStatus).toContainText('Saving your changes before restarting.');

  const newWriteBlocked = await page.evaluate(() => {
    try {
      window.floAppUpdate?.beginWrite();
      return false;
    } catch {
      return true;
    }
  });
  expect(newWriteBlocked).toBe(true);

  const stillWaiting = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    return {
      waiting: registration?.waiting?.state,
      staticCaches: (await caches.keys()).filter((name) => name.startsWith('flo-static-')),
    };
  });
  expect(stillWaiting.waiting).toBe('installed');
  expect(stillWaiting.staticCaches).toContain(oldCacheName);
  console.log(
    `T-SW-02 pending barrier: UI requested restart; waiting=${stillWaiting.waiting}; old cache retained; new writes rejected.`,
  );

  await page.evaluate((fixture) => {
    window.__recordServiceWorkerEvent?.('synthetic-write-started');
    const request = indexedDB.open('synthetic-sw-update-evidence', 1);
    request.onerror = () => {
      throw request.error;
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('records', 'readwrite');
      transaction.objectStore('records').put(fixture);
      transaction.onerror = () => {
        throw transaction.error;
      };
      transaction.onabort = () => {
        throw transaction.error ?? new Error('Synthetic app-side write aborted.');
      };
      transaction.oncomplete = () => {
        database.close();
        window.__recordServiceWorkerEvent?.('synthetic-write-complete');
      };
    };
  }, pendingWrite);

  await expect.poll(() => readSyntheticRecord(page, pendingWrite.id)).toEqual(pendingWrite);
  const reload = page.waitForNavigation({ waitUntil: 'load', timeout: 15000 });
  await page.evaluate(() => {
    window.__recordServiceWorkerEvent?.('write-lease-released');
    window.__releaseSyntheticWrite?.();
  });
  await reload;
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  expect(await readSyntheticRecord(page, pendingWrite.id)).toEqual(pendingWrite);
  await expectOnlyOwnedCacheWasDeleted(page, oldCacheName ?? '');

  const trace = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[],
    TRACE_KEY,
  );
  const indexOf = (event: string) => trace.lastIndexOf(event);
  expect(indexOf('synthetic-write-complete')).toBeGreaterThanOrEqual(0);
  expect(indexOf('write-lease-released')).toBeGreaterThan(indexOf('synthetic-write-complete'));
  expect(indexOf('message:ACTIVATION_REQUEST_ACCEPTED')).toBeGreaterThan(
    indexOf('write-lease-released'),
  );
  expect(indexOf('message:SW_ACTIVATED')).toBeGreaterThan(
    indexOf('message:ACTIVATION_REQUEST_ACCEPTED'),
  );
  expect(indexOf('controllerchange')).toBeGreaterThan(
    indexOf('message:ACTIVATION_REQUEST_ACCEPTED'),
  );

  console.log(`T-SW-02 activation trace: ${trace.join(' -> ')}`);

  const workerSource = await readFile(resolve(process.cwd(), 'src/sw/entry.ts'), 'utf8');
  expect(workerSource).not.toMatch(/indexeddb|opfs|storage\.getdirectory/i);
  expect(workerSource).toContain('name.startsWith(CACHE_PREFIX)');
  const headers = await readFile(resolve(process.cwd(), 'public/_headers'), 'utf8');
  expect(headers).toBe('/sw.js\n  Cache-Control: no-cache, no-store, must-revalidate\n');
});
