const CACHE_PREFIX = 'flo-static-';
const BUILD_ID = '__FLO_BUILD_ID__';
const PRECACHE_URLS: readonly string[] = ['__FLO_PRECACHE_URLS__'];
const UPDATE_READY_MESSAGE = 'An update is ready. Save your changes before restarting.';

interface ExtendableWorkerEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface WorkerFetchEvent extends ExtendableWorkerEvent {
  request: Request;
  respondWith(response: Promise<Response> | Response): void;
}

interface WorkerMessageEvent extends ExtendableWorkerEvent {
  data: unknown;
  source: { id: string } | null;
}

interface WorkerClient {
  id: string;
  type: string;
  url: string;
  postMessage(message: unknown): void;
}

interface WorkerClients {
  claim(): Promise<void>;
  get(id: string): Promise<WorkerClient | undefined>;
  matchAll(options: { includeUncontrolled: boolean; type: 'window' }): Promise<WorkerClient[]>;
}

interface WorkerRegistration {
  active: unknown;
  waiting: unknown;
}

interface WorkerScope extends EventTarget {
  caches: CacheStorage;
  clients: WorkerClients;
  location: Location;
  registration: WorkerRegistration;
  skipWaiting(): Promise<void>;
}

interface SkipWaitingRequest {
  type: 'SKIP_WAITING';
  requestId: string;
  writesFlushed: true;
  transactionsClosed: true;
  appLocked: true;
  writesBlocked: true;
}

interface BuildIdRequest {
  type: 'GET_BUILD_ID';
  requestId: string;
}

const worker = globalThis as unknown as WorkerScope;
const cacheName = `${CACHE_PREFIX}${BUILD_ID}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSkipWaitingRequest(value: unknown): value is SkipWaitingRequest {
  if (!isRecord(value)) return false;

  return (
    value.type === 'SKIP_WAITING' &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    value.writesFlushed === true &&
    value.transactionsClosed === true &&
    value.appLocked === true &&
    value.writesBlocked === true
  );
}

function isBuildIdRequest(value: unknown): value is BuildIdRequest {
  return (
    isRecord(value) &&
    value.type === 'GET_BUILD_ID' &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0
  );
}

async function notifyClientsOfUpdate(): Promise<void> {
  if (!worker.registration.active) return;

  const clients = await worker.clients.matchAll({
    includeUncontrolled: true,
    type: 'window',
  });

  for (const client of clients) {
    client.postMessage({
      type: 'UPDATE_READY',
      buildId: BUILD_ID,
      message: UPDATE_READY_MESSAGE,
    });
  }
}

worker.addEventListener('install', ((event: ExtendableWorkerEvent) => {
  event.waitUntil(
    (async () => {
      const cache = await worker.caches.open(cacheName);
      await cache.addAll([...PRECACHE_URLS]);
      await notifyClientsOfUpdate();
    })(),
  );
}) as EventListener);

worker.addEventListener('activate', ((event: ExtendableWorkerEvent) => {
  event.waitUntil(
    (async () => {
      const names = await worker.caches.keys();

      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== cacheName)
          .map((name) => worker.caches.delete(name)),
      );

      await worker.clients.claim();
      const clients = await worker.clients.matchAll({
        includeUncontrolled: true,
        type: 'window',
      });

      for (const client of clients) {
        client.postMessage({ type: 'SW_ACTIVATED', buildId: BUILD_ID });
      }
    })(),
  );
}) as EventListener);

worker.addEventListener('fetch', ((event: WorkerFetchEvent) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== worker.location.origin || event.request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const cache = await worker.caches.open(cacheName);
      const cached = await cache.match(event.request);
      if (cached) return cached;

      if (event.request.mode === 'navigate') {
        const appShell = await cache.match(new URL('/index.html', worker.location.origin).href);
        if (appShell) return appShell;

        try {
          return await fetch(event.request);
        } catch {
          return Response.error();
        }
      }

      try {
        return await fetch(event.request);
      } catch {
        return Response.error();
      }
    })(),
  );
}) as EventListener);

worker.addEventListener('message', ((event: WorkerMessageEvent) => {
  if (!event.source) return;

  event.waitUntil(
    (async () => {
      const client = await worker.clients.get(event.source?.id ?? '');
      if (!client || client.type !== 'window') return;

      let clientOrigin: string;
      try {
        clientOrigin = new URL(client.url).origin;
      } catch {
        return;
      }
      if (clientOrigin !== worker.location.origin) return;

      if (isBuildIdRequest(event.data)) {
        client.postMessage({
          type: 'WORKER_BUILD_ID',
          requestId: event.data.requestId,
          buildId: BUILD_ID,
        });
        return;
      }

      if (!isSkipWaitingRequest(event.data)) return;

      client.postMessage({
        type: 'ACTIVATION_REQUEST_ACCEPTED',
        requestId: event.data.requestId,
        buildId: BUILD_ID,
      });
      await worker.skipWaiting();
    })(),
  );
}) as EventListener);
