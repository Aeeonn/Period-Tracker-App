import { expect, test, type Page } from '@playwright/test';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { createEngineWorkerRunner } from '../../src/app/engine-runner.ts';
import type { EngineInput } from '../../src/contracts/engine-api.ts';
import { runEngine } from '../../src/engine/index.ts';
import { parse } from '../../src/lib/localdate/index.ts';
import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
} from '../../src/app/engine-worker-messages.ts';
import { configureThroughUi, fillConfirmation, setupOrUnlockApp } from './helpers/lock.ts';

let server: Server | undefined;
let origin = '';
let serverOnline = true;
const distRoot = resolve(process.cwd(), 'dist');

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

async function serveBuiltApp(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', origin || 'http://127.0.0.1');
  if (requestUrl.pathname === '/__test/offline') {
    serverOnline = false;
    response.writeHead(204, { 'cache-control': 'no-store' }).end();
    return;
  }
  if (!serverOnline) {
    request.socket.destroy();
    return;
  }

  const requestPath = decodeURIComponent(
    requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname,
  );
  const filePath = resolve(distRoot, `.${requestPath}`);
  if (!filePath.startsWith(`${distRoot}${sep}`)) {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('invalid path');
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
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
  }
}

async function listenOnEphemeralPort(httpServer: Server): Promise<number> {
  await new Promise<void>((resolveListen, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('P1 app server did not bind');
  return address.port;
}

class SyntheticEngineWorker extends EventTarget {
  posted: EngineWorkerRequest | undefined;
  terminated = false;

  constructor(private readonly onPost: (worker: SyntheticEngineWorker) => void) {
    super();
  }

  postMessage(message: EngineWorkerRequest): void {
    this.posted = message;
    this.onPost(this);
  }

  terminate(): void {
    this.terminated = true;
  }

  sendMessage(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  sendError(): void {
    this.dispatchEvent(new Event('error', { cancelable: true }));
  }
}

function syntheticEngineInput(): EngineInput {
  const today = parse('2032-04-05');
  if (today === null) throw new Error('Synthetic worker LocalDate did not parse');
  return {
    today,
    profile: { lifeStage: 'cycle', contraception: [] },
    dayLogs: [],
    episodesOverride: [],
    pregnancies: [],
    coupleEntriesAllowedForInsights: [],
  };
}

test('engine worker client passes a LocalDate input and releases a completed worker', async () => {
  const input = syntheticEngineInput();
  const output = runEngine(input);
  const worker = new SyntheticEngineWorker((instance) =>
    instance.sendMessage({ type: 'result', output }),
  );
  const runner = createEngineWorkerRunner(() => worker as unknown as Worker);

  await expect(runner(input)).resolves.toEqual(output);
  expect(worker.posted).toEqual({ type: 'run', input });
  expect(worker.terminated).toBe(true);
});

test('engine worker client rejects worker errors and malformed replies without retaining workers', async () => {
  const input = syntheticEngineInput();
  const workerError = new SyntheticEngineWorker((instance) =>
    instance.sendMessage({ type: 'error' } satisfies EngineWorkerResponse),
  );
  const failedRunner = createEngineWorkerRunner(() => workerError as unknown as Worker);
  await expect(failedRunner(input)).rejects.toThrow('could not calculate safely');
  expect(workerError.terminated).toBe(true);

  const malformedWorker = new SyntheticEngineWorker((instance) =>
    instance.sendMessage({ type: 'unexpected' }),
  );
  const malformedRunner = createEngineWorkerRunner(() => malformedWorker as unknown as Worker);
  await expect(malformedRunner(input)).rejects.toThrow('invalid response');
  expect(malformedWorker.terminated).toBe(true);
});

test('engine worker client rejects worker runtime errors and input clone failures', async () => {
  const input = syntheticEngineInput();
  const runtimeError = new SyntheticEngineWorker((instance) => instance.sendError());
  const runtimeErrorRunner = createEngineWorkerRunner(() => runtimeError as unknown as Worker);
  await expect(runtimeErrorRunner(input)).rejects.toThrow('worker failed');
  expect(runtimeError.terminated).toBe(true);

  const cloneFailure = new SyntheticEngineWorker(() => {
    throw new DOMException('Synthetic clone failure', 'DataCloneError');
  });
  const cloneFailureRunner = createEngineWorkerRunner(() => cloneFailure as unknown as Worker);
  await expect(cloneFailureRunner(input)).rejects.toThrow('could not be sent');
  expect(cloneFailure.terminated).toBe(true);
});

async function finishOwnerOnboarding(page: Page): Promise<void> {
  await page.goto(origin);
  await expect(
    page.getByRole('heading', { name: 'Welcome to your cycle companion' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make room for the app' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue in browser anyway' }).click();
  await expect(page.getByRole('heading', { name: 'Which brings you here?' })).toBeVisible();
  await page.getByRole('button', { name: "I'm tracking my cycle" }).click();
  const recovery = await configureThroughUi(page);
  await fillConfirmation(page, recovery.code, recovery.positions);
  await expect(page.getByRole('heading', { name: 'Your basics' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gentle reminders' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Who runs the app/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pair later and continue to Today' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

test('P1 integrated Today and Calendar use the engine worker; three taps persist logs offline', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.install({ time: new Date('2032-04-05T12:00:00.000Z') });
  const externalOrigins: string[] = [];
  const engineWorkerRequests: string[] = [];
  const appOrigin = new URL(origin).origin;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== appOrigin) externalOrigins.push(url.origin);
    if (url.pathname.toLowerCase().includes('engine.worker')) engineWorkerRequests.push(url.href);
  });

  await finishOwnerOnboarding(page);
  await expect(page.getByRole('heading', { name: 'No cycle logs yet' })).toBeVisible();
  await expect(page.locator('.today-chance__uncertainty')).toContainText('uncertain');
  await expect(page.locator('.today-safety-line')).toContainText('"safe"');
  await expect.poll(() => engineWorkerRequests.length).toBeGreaterThan(0);

  const todayWorkerCount = engineWorkerRequests.length;
  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  await expect.poll(() => engineWorkerRequests.length).toBeGreaterThan(todayWorkerCount);

  await page.getByRole('link', { name: 'Log', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Log', exact: true })).toBeVisible();
  await expect(page.locator('.log-screen__form-card[hidden] button:not(:disabled)')).toHaveCount(0);

  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Period started', exact: true }).click();
  await page.getByRole('button', { name: 'Log today', exact: true }).click();
  const quickLog = page.getByRole('dialog', { name: 'Quick log' });
  await quickLog
    .getByRole('group', { name: 'Symptoms' })
    .getByRole('button', { name: 'Cramps' })
    .click();
  await expect(page.locator('.today-logged-summary')).toContainText('Flow: Medium');
  await expect(page.locator('.today-logged-summary')).toContainText('Symptoms: Cramps');
  expect(externalOrigins).toEqual([]);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await setupOrUnlockApp(page);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  const offlineStatus = await page.evaluate(async () => {
    const response = await fetch('/__test/offline', { cache: 'no-store' });
    return response.status;
  });
  expect(offlineStatus).toBe(204);
  await page.reload();
  await setupOrUnlockApp(page);
  await expect(page.locator('.today-logged-summary')).toContainText('Flow: Medium');
  await expect(page.locator('.today-logged-summary')).toContainText('Symptoms: Cramps');
});

test.beforeEach(() => {
  serverOnline = true;
});

test.beforeAll(async () => {
  server = createServer((request, response) => {
    void serveBuiltApp(request, response).catch((error: unknown) => {
      response
        .writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        .end(error instanceof Error ? error.message : String(error));
    });
  });
  const port = await listenOnEphemeralPort(server);
  origin = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  if (server?.listening) {
    await new Promise<void>((resolveClose, reject) => {
      server?.close((error) => (error ? reject(error) : resolveClose()));
    });
  }
  server = undefined;
});
