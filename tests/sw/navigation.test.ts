import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { transformWithEsbuild } from 'vite';

type CacheEntry = Response | undefined;
type WorkerRequest = Pick<Request, 'method' | 'mode' | 'url'>;
type FetchHandler = (event: {
  request: WorkerRequest;
  respondWith(response: Promise<Response> | Response): void;
}) => void;

interface WorkerHarness {
  readonly cacheMatch: ReturnType<typeof vi.fn>;
  readonly fetch: ReturnType<typeof vi.fn>;
  readonly fetchHandler: FetchHandler;
}

async function createWorkerHarness(
  entries: ReadonlyMap<string, CacheEntry>,
): Promise<WorkerHarness> {
  const source = await readFile(new URL('../../src/sw/entry.ts', import.meta.url), 'utf8');
  const { code } = await transformWithEsbuild(source, 'src/sw/entry.ts', {
    target: 'es2022',
    loader: 'ts',
  });
  const listeners = new Map<string, (event: unknown) => void>();
  const cacheMatch = vi.fn(async (request: Request | string) => {
    const url = typeof request === 'string' ? request : request.url;
    return entries.get(url);
  });
  const cache = { match: cacheMatch };
  const fetch = vi.fn(async () => new Response('synthetic network shell'));
  const workerScope = {
    addEventListener(type: string, listener: (event: unknown) => void) {
      listeners.set(type, listener);
    },
    caches: { open: vi.fn(async () => cache) },
    clients: { get: vi.fn(), matchAll: vi.fn(async () => []), claim: vi.fn() },
    location: { origin: 'https://app.test' },
    registration: { active: {}, waiting: null },
    skipWaiting: vi.fn(),
    fetch,
    Response,
    URL,
  };
  runInNewContext(code, workerScope);
  const fetchHandler = listeners.get('fetch');
  if (!fetchHandler) throw new Error('The worker did not register its fetch handler');

  return {
    cacheMatch,
    fetch,
    fetchHandler: fetchHandler as FetchHandler,
  };
}

async function respondTo(worker: WorkerHarness, url: string, mode: RequestMode): Promise<Response> {
  let response: Promise<Response> | Response | undefined;
  worker.fetchHandler({
    request: { url, method: 'GET', mode },
    respondWith(value) {
      response = value;
    },
  });
  if (!response) throw new Error('The worker did not respond to the request');
  return response;
}

function redirectedShell(): Response {
  const response = new Response('<main>synthetic shell</main>', {
    status: 200,
    statusText: 'OK',
    headers: {
      'cache-control': 'public, max-age=0',
      'content-security-policy': "default-src 'none'; script-src 'self'",
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
  Object.defineProperty(response, 'redirected', { value: true });
  return response;
}

describe('service worker navigation response compatibility', () => {
  it('rebuilds a redirected cached shell with the same bytes and response headers', async () => {
    const original = redirectedShell();
    const worker = await createWorkerHarness(new Map([['https://app.test/index.html', original]]));

    const response = await respondTo(worker, 'https://app.test/?today=synthetic', 'navigate');

    expect(response).not.toBe(original);
    expect(response.redirected).toBe(false);
    expect(response.status).toBe(original.status);
    expect(response.statusText).toBe(original.statusText);
    expect(Object.fromEntries(response.headers)).toEqual(Object.fromEntries(original.headers));
    await expect(response.text()).resolves.toBe('<main>synthetic shell</main>');
    expect(worker.cacheMatch).toHaveBeenCalledTimes(2);
  });

  it('normalizes an exact cached navigation when that cached response was redirected', async () => {
    const original = redirectedShell();
    const worker = await createWorkerHarness(new Map([['https://app.test/index.html', original]]));

    const response = await respondTo(worker, 'https://app.test/index.html', 'navigate');

    expect(response).not.toBe(original);
    expect(response.redirected).toBe(false);
    expect(response.headers.get('content-security-policy')).toBe(
      original.headers.get('content-security-policy'),
    );
    await expect(response.text()).resolves.toBe('<main>synthetic shell</main>');
    expect(worker.cacheMatch).toHaveBeenCalledTimes(1);
  });

  it('returns nonredirected cached navigations and same-origin assets unchanged', async () => {
    const root = new Response('<main>root shell</main>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    const engine = new Response('synthetic engine asset', {
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
    });
    const worker = await createWorkerHarness(
      new Map([
        ['https://app.test/', root],
        ['https://app.test/assets/engine.worker.js', engine],
      ]),
    );

    const rootResponse = await respondTo(worker, 'https://app.test/', 'navigate');
    const engineResponse = await respondTo(
      worker,
      'https://app.test/assets/engine.worker.js',
      'same-origin',
    );

    expect(rootResponse).toBe(root);
    expect(engineResponse).toBe(engine);
    expect(await engineResponse.text()).toBe('synthetic engine asset');
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it('uses the navigation network fallback when neither cached shell path exists', async () => {
    const worker = await createWorkerHarness(new Map());
    const requestUrl = 'https://app.test/?today=synthetic';

    const response = await respondTo(worker, requestUrl, 'navigate');

    expect(worker.fetch).toHaveBeenCalledOnce();
    expect(worker.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ url: requestUrl, method: 'GET', mode: 'navigate' }),
    );
    await expect(response.text()).resolves.toBe('synthetic network shell');
  });
});
